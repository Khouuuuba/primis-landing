/**
 * Batch Job Processor
 * Processes pending batch jobs by sending prompts to RunPod serverless
 */

import pool from './db/connection.js'
import * as serverless from './runpod-serverless.js'
import { uploadImage } from './storage.js'

const SDXL_ENDPOINT = process.env.RUNPOD_SDXL_ENDPOINT

// Processing configuration
const MAX_CONCURRENT_ITEMS = 2 // Process 2 images at a time (reduced for reliability)
const POLL_INTERVAL = 5000 // Check for new jobs every 5 seconds

/**
 * Process a single batch item (one prompt)
 */
async function processItem(item, options = {}) {
  const {
    width = 1024,
    height = 1024,
    steps = 25,
    guidanceScale = 7.5
  } = options

  try {
    // Update item status to processing
    await pool.query(
      `UPDATE batch_items 
       SET status = 'processing', started_at = NOW() 
       WHERE id = $1`,
      [item.id]
    )

    console.log(`  Processing: "${item.prompt.slice(0, 50)}..."`)

    // Submit to RunPod
    const startTime = Date.now()
    
    const result = await serverless.runSync(SDXL_ENDPOINT, {
      prompt: item.prompt,
      negative_prompt: item.negative_prompt || '',
      width,
      height,
      num_inference_steps: steps,
      guidance_scale: guidanceScale
    }, 120000) // 2 minute timeout

    const executionTime = Date.now() - startTime

    if (result.status === 'COMPLETED') {
      // Extract image data
      let resultUrl = null
      let resultData = result.output

      // RunPod might return image as base64 or URL depending on the template
      if (result.output?.image_url) {
        // Direct URL from RunPod
        resultUrl = result.output.image_url
      } else if (result.output?.images?.[0]) {
        // Could be URL or base64
        const imageData = result.output.images[0]
        if (imageData.startsWith('http')) {
          resultUrl = imageData
        } else {
          // Base64 - upload to storage
          resultUrl = await uploadImage(imageData, item.batch_job_id, item.id)
        }
      } else if (result.output?.image) {
        // Single image as base64
        resultUrl = await uploadImage(result.output.image, item.batch_job_id, item.id)
      }

      // Update item as completed
      await pool.query(
        `UPDATE batch_items 
         SET status = 'completed', 
             result_url = $1, 
             result_data = $2,
             execution_time_ms = $3,
             completed_at = NOW()
         WHERE id = $4`,
        [resultUrl, JSON.stringify(resultData), executionTime, item.id]
      )

      console.log(`  ✅ Completed in ${(executionTime / 1000).toFixed(1)}s`)
      return { success: true, executionTime, resultUrl }

    } else {
      throw new Error(`RunPod returned status: ${result.status}`)
    }

  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`)
    
    // Update item as failed
    await pool.query(
      `UPDATE batch_items 
       SET status = 'failed', 
           error_message = $1,
           completed_at = NOW()
       WHERE id = $2`,
      [error.message, item.id]
    )

    return { success: false, error: error.message }
  }
}

/**
 * Process a batch job
 */
async function processBatchJob(job) {
  console.log(`\n📦 Processing batch job: ${job.id}`)
  console.log(`   Template: ${job.template}, Items: ${job.total_items}`)

  try {
    // Update job status to processing
    await pool.query(
      `UPDATE batch_jobs 
       SET status = 'processing', started_at = NOW() 
       WHERE id = $1`,
      [job.id]
    )

    // Get all pending items for this job
    const itemsResult = await pool.query(
      `SELECT * FROM batch_items 
       WHERE batch_job_id = $1 AND status = 'pending'
       ORDER BY created_at`,
      [job.id]
    )

    const items = itemsResult.rows
    const options = job.options || {}

    // Process items in batches of MAX_CONCURRENT_ITEMS
    for (let i = 0; i < items.length; i += MAX_CONCURRENT_ITEMS) {
      const batch = items.slice(i, i + MAX_CONCURRENT_ITEMS)
      
      console.log(`\n   Batch ${Math.floor(i / MAX_CONCURRENT_ITEMS) + 1}: Processing ${batch.length} items...`)
      
      // Process batch concurrently
      await Promise.all(batch.map(item => processItem(item, options)))

      // Update job progress
      const progressResult = await pool.query(
        `SELECT 
           COUNT(*) FILTER (WHERE status = 'completed') as completed,
           COUNT(*) FILTER (WHERE status = 'failed') as failed
         FROM batch_items 
         WHERE batch_job_id = $1`,
        [job.id]
      )

      const { completed, failed } = progressResult.rows[0]
      
      await pool.query(
        `UPDATE batch_jobs 
         SET completed_items = $1, failed_items = $2 
         WHERE id = $3`,
        [parseInt(completed), parseInt(failed), job.id]
      )
    }

    // Final status check
    const finalResult = await pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status = 'failed') as failed
       FROM batch_items 
       WHERE batch_job_id = $1`,
      [job.id]
    )

    const { completed, failed } = finalResult.rows[0]
    const finalStatus = parseInt(failed) === job.total_items ? 'failed' : 'completed'

    await pool.query(
      `UPDATE batch_jobs 
       SET status = $1, 
           completed_items = $2, 
           failed_items = $3,
           completed_at = NOW()
       WHERE id = $4`,
      [finalStatus, parseInt(completed), parseInt(failed), job.id]
    )

    console.log(`\n✅ Batch job complete: ${completed}/${job.total_items} succeeded, ${failed} failed`)

  } catch (error) {
    console.error(`❌ Batch job failed:`, error)
    
    await pool.query(
      `UPDATE batch_jobs 
       SET status = 'failed', completed_at = NOW() 
       WHERE id = $1`,
      [job.id]
    )
  }
}

/**
 * Main processor loop - checks for pending jobs
 */
async function startProcessor() {
  console.log('\n🚀 Batch processor started')
  console.log(`   SDXL Endpoint: ${SDXL_ENDPOINT || 'NOT CONFIGURED'}`)
  console.log(`   Max concurrent: ${MAX_CONCURRENT_ITEMS}`)
  console.log(`   Poll interval: ${POLL_INTERVAL}ms\n`)

  if (!SDXL_ENDPOINT) {
    console.error('❌ RUNPOD_SDXL_ENDPOINT not configured. Exiting.')
    process.exit(1)
  }

  while (true) {
    try {
      // Find pending batch jobs
      const result = await pool.query(
        `SELECT * FROM batch_jobs 
         WHERE status = 'pending' 
         ORDER BY created_at 
         LIMIT 1`
      )

      if (result.rows.length > 0) {
        await processBatchJob(result.rows[0])
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))

    } catch (error) {
      console.error('Processor error:', error)
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))
    }
  }
}

// Export for use as module or run directly
export { startProcessor, processBatchJob, processItem }
