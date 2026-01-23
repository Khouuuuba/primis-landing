import { Router } from 'express'
import pool from '../db/connection.js'
import { requireAuth } from '../middleware/auth.js'
import * as serverless from '../runpod-serverless.js'
import { processBatchJob } from '../batch-processor.js'

const router = Router()

// Pricing per image
const COST_PER_IMAGE = 0.01 // $0.01 per image - customer acquisition pricing

// Available templates
const TEMPLATES = {
  sdxl: {
    name: 'Stable Diffusion XL',
    description: 'High-quality 1024x1024 images',
    defaultWidth: 1024,
    defaultHeight: 1024,
    defaultSteps: 25,
    costPerImage: 0.01
  }
}

/**
 * GET /api/batch/templates
 * List available generation templates
 */
router.get('/templates', (req, res) => {
  res.json({
    templates: Object.entries(TEMPLATES).map(([id, template]) => ({
      id,
      ...template
    }))
  })
})

/**
 * POST /api/batch/estimate
 * Get cost estimate for a batch job
 */
router.post('/estimate', (req, res) => {
  const { prompts, template = 'sdxl' } = req.body

  if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
    return res.status(400).json({ error: 'prompts array is required' })
  }

  const templateConfig = TEMPLATES[template]
  if (!templateConfig) {
    return res.status(400).json({ error: 'Invalid template' })
  }

  const itemCount = prompts.length
  const costPerImage = templateConfig.costPerImage
  const totalCost = itemCount * costPerImage

  res.json({
    template,
    itemCount,
    costPerImage,
    totalCost,
    estimatedTimeSeconds: itemCount * 15 // ~15s per image
  })
})

/**
 * POST /api/batch/jobs
 * Submit a new batch job
 */
router.post('/jobs', requireAuth, async (req, res) => {
  const { prompts, template = 'sdxl', options = {} } = req.body

  if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
    return res.status(400).json({ error: 'prompts array is required' })
  }

  if (prompts.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 prompts per batch' })
  }

  const templateConfig = TEMPLATES[template]
  if (!templateConfig) {
    return res.status(400).json({ error: 'Invalid template' })
  }

  const client = await pool.connect()
  
  try {
    await client.query('BEGIN')

    // Check user's credit balance
    const creditResult = await client.query(
      'SELECT balance_usd FROM credits WHERE user_id = $1',
      [req.userId]
    )

    let balance = parseFloat(creditResult.rows[0]?.balance_usd || 0)
    const totalCost = prompts.length * templateConfig.costPerImage

    // Demo mode: if insufficient credits, give user free credits
    if (balance < totalCost) {
      const creditsToAdd = 100 // Give $100 demo credits
      
      // Check if credits record exists
      if (creditResult.rows.length === 0) {
        // Create new credits record
        await client.query(
          `INSERT INTO credits (user_id, balance_usd) VALUES ($1, $2)`,
          [req.userId, creditsToAdd]
        )
      } else {
        // Update existing credits record
        await client.query(
          `UPDATE credits SET balance_usd = balance_usd + $1 WHERE user_id = $2`,
          [creditsToAdd, req.userId]
        )
      }
      
      balance = balance + creditsToAdd
      console.log(`Demo mode: Added $${creditsToAdd} credits to user ${req.userId}`)
    }

    // Create batch job
    const jobResult = await client.query(
      `INSERT INTO batch_jobs (user_id, template, total_items, cost_per_image, total_cost, options, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [req.userId, template, prompts.length, templateConfig.costPerImage, totalCost, JSON.stringify(options)]
    )

    const batchJob = jobResult.rows[0]

    // Create batch items for each prompt
    for (const prompt of prompts) {
      await client.query(
        `INSERT INTO batch_items (batch_job_id, prompt, negative_prompt, status)
         VALUES ($1, $2, $3, 'pending')`,
        [batchJob.id, prompt.trim(), options.negativePrompt || '']
      )
    }

    // Deduct credits
    await client.query(
      'UPDATE credits SET balance_usd = balance_usd - $1 WHERE user_id = $2',
      [totalCost, req.userId]
    )

    // Record transaction
    await client.query(
      `INSERT INTO credit_transactions (user_id, type, amount_usd, job_id, description)
       VALUES ($1, 'usage', $2, $3, $4)`,
      [req.userId, -totalCost, batchJob.id, `Batch job: ${prompts.length} images`]
    )

    await client.query('COMMIT')

    res.status(201).json({
      success: true,
      job: {
        id: batchJob.id,
        template: batchJob.template,
        totalItems: batchJob.total_items,
        totalCost: parseFloat(batchJob.total_cost),
        status: batchJob.status,
        createdAt: batchJob.created_at
      },
      message: `Batch job created with ${prompts.length} prompts`
    })

  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error creating batch job:', error.message)
    console.error('Full error:', error)
    res.status(500).json({ error: 'Failed to create batch job', details: error.message })
  } finally {
    client.release()
  }
})

/**
 * GET /api/batch/jobs
 * List user's batch jobs
 */
router.get('/jobs', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM batch_jobs 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [req.userId]
    )

    res.json({
      jobs: result.rows.map(job => ({
        id: job.id,
        template: job.template,
        status: job.status,
        totalItems: job.total_items,
        completedItems: job.completed_items,
        failedItems: job.failed_items,
        totalCost: parseFloat(job.total_cost),
        createdAt: job.created_at,
        completedAt: job.completed_at
      }))
    })
  } catch (error) {
    console.error('Error fetching batch jobs:', error)
    res.status(500).json({ error: 'Failed to fetch batch jobs' })
  }
})

/**
 * GET /api/batch/jobs/:id
 * Get batch job details with items
 */
router.get('/jobs/:id', requireAuth, async (req, res) => {
  try {
    // Get job
    const jobResult = await pool.query(
      'SELECT * FROM batch_jobs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    )

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Batch job not found' })
    }

    const job = jobResult.rows[0]

    // Get items
    const itemsResult = await pool.query(
      `SELECT id, prompt, status, result_url, error_message, execution_time_ms, completed_at
       FROM batch_items 
       WHERE batch_job_id = $1 
       ORDER BY created_at`,
      [job.id]
    )

    res.json({
      job: {
        id: job.id,
        template: job.template,
        status: job.status,
        totalItems: job.total_items,
        completedItems: job.completed_items,
        failedItems: job.failed_items,
        totalCost: parseFloat(job.total_cost),
        options: job.options,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at
      },
      items: itemsResult.rows.map(item => ({
        id: item.id,
        prompt: item.prompt,
        status: item.status,
        resultUrl: item.result_url,
        error: item.error_message,
        executionTimeMs: item.execution_time_ms,
        completedAt: item.completed_at
      }))
    })
  } catch (error) {
    console.error('Error fetching batch job:', error)
    res.status(500).json({ error: 'Failed to fetch batch job' })
  }
})

/**
 * POST /api/batch/jobs/:id/process
 * Manually trigger processing of a batch job (for testing)
 */
router.post('/jobs/:id/process', requireAuth, async (req, res) => {
  try {
    // Get job
    const jobResult = await pool.query(
      'SELECT * FROM batch_jobs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    )

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Batch job not found' })
    }

    const job = jobResult.rows[0]

    if (job.status !== 'pending') {
      return res.status(400).json({ error: `Job already ${job.status}` })
    }

    // Start processing in background
    res.json({ 
      success: true, 
      message: 'Processing started',
      jobId: job.id 
    })

    // Process the job (don't await - runs in background)
    processBatchJob(job).catch(err => {
      console.error('Background processing failed:', err)
    })

  } catch (error) {
    console.error('Error triggering process:', error)
    res.status(500).json({ error: 'Failed to trigger processing' })
  }
})

/**
 * POST /api/batch/jobs/:id/retry
 * Reset a failed or stuck job to pending for retry
 */
router.post('/jobs/:id/retry', requireAuth, async (req, res) => {
  const client = await pool.connect()
  
  try {
    await client.query('BEGIN')

    // Get job
    const jobResult = await client.query(
      'SELECT * FROM batch_jobs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    )

    if (jobResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Batch job not found' })
    }

    const job = jobResult.rows[0]

    // Only allow retry for failed or stuck (processing) jobs
    if (!['failed', 'processing'].includes(job.status)) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: `Cannot retry job with status: ${job.status}` })
    }

    // Reset all non-completed items to pending
    await client.query(
      `UPDATE batch_items 
       SET status = 'pending', started_at = NULL, error_message = NULL 
       WHERE batch_job_id = $1 AND status != 'completed'`,
      [job.id]
    )

    // Reset job status to pending
    await client.query(
      `UPDATE batch_jobs 
       SET status = 'pending', started_at = NULL, completed_at = NULL 
       WHERE id = $1`,
      [job.id]
    )

    await client.query('COMMIT')

    res.json({ 
      success: true, 
      message: 'Job reset to pending. Click Start to process again.',
      jobId: job.id 
    })

  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error retrying job:', error)
    res.status(500).json({ error: 'Failed to retry job' })
  } finally {
    client.release()
  }
})

export default router
