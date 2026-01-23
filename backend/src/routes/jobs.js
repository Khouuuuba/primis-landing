import { Router } from 'express'
import { query } from '../db/connection.js'
import { requireAuth } from '../middleware/auth.js'
import runpod from '../runpod.js'

const router = Router()

// GPU pricing (market rate and Primis subsidized rate)
// Maps our internal IDs to RunPod GPU type IDs
const GPU_PRICING = {
  'gpu-a100-40': { 
    name: 'NVIDIA A100 40GB', 
    marketRate: 1.89, 
    primisRate: 1.49,
    vram: 40,
    cores: 6912,
    runpodId: 'NVIDIA A100 80GB PCIe' // RunPod doesn't have 40GB, use 80GB
  },
  'gpu-a100-80': { 
    name: 'NVIDIA A100 80GB', 
    marketRate: 2.49, 
    primisRate: 1.89,
    vram: 80,
    cores: 6912,
    runpodId: 'NVIDIA A100 80GB PCIe'
  },
  'gpu-h100-80': { 
    name: 'NVIDIA H100 80GB', 
    marketRate: 3.89, 
    primisRate: 2.99,
    vram: 80,
    cores: 16896,
    runpodId: 'NVIDIA H100 80GB HBM3'
  },
  'gpu-l40s': { 
    name: 'NVIDIA L40S 48GB', 
    marketRate: 1.29, 
    primisRate: 0.99,
    vram: 48,
    cores: 18176,
    runpodId: 'NVIDIA L40'
  },
  'gpu-rtx4090': { 
    name: 'NVIDIA RTX 4090', 
    marketRate: 0.89, 
    primisRate: 0.69,
    vram: 24,
    cores: 16384,
    runpodId: 'NVIDIA GeForce RTX 4090'
  }
}

// Cache for RunPod GPU availability (refresh every 60s)
let gpuAvailabilityCache = null
let cacheTimestamp = 0
const CACHE_TTL = 60000 // 1 minute

/**
 * GET /api/jobs/instances
 * Get available GPU instances with pricing
 */
router.get('/instances', async (req, res) => {
  try {
    let runpodGpus = []
    
    // Try to fetch real RunPod availability
    if (process.env.RUNPOD_API_KEY) {
      const now = Date.now()
      if (!gpuAvailabilityCache || now - cacheTimestamp > CACHE_TTL) {
        try {
          runpodGpus = await runpod.getGpuTypes()
          gpuAvailabilityCache = runpodGpus
          cacheTimestamp = now
        } catch (err) {
          console.log('RunPod fetch failed, using cached/default data')
          runpodGpus = gpuAvailabilityCache || []
        }
      } else {
        runpodGpus = gpuAvailabilityCache
      }
    }
    
    // Build instances list with real availability when possible
    const instances = Object.entries(GPU_PRICING).map(([id, gpu]) => {
      const runpodMatch = runpodGpus.find(r => r.name === gpu.runpodId)
      return {
        id,
        name: gpu.name,
        vram: gpu.vram,
        cores: gpu.cores,
        marketRate: gpu.marketRate,
        primisRate: gpu.primisRate,
        available: runpodMatch ? (runpodMatch.available ? 50 : 0) : Math.floor(Math.random() * 50) + 10,
        discount: Math.round((1 - gpu.primisRate / gpu.marketRate) * 100),
        runpodAvailable: !!runpodMatch?.available
      }
    })
    
    res.json({ 
      instances,
      runpodConnected: !!process.env.RUNPOD_API_KEY
    })
    
  } catch (error) {
    console.error('Get instances error:', error)
    res.status(500).json({ error: 'Failed to get instances' })
  }
})

/**
 * GET /api/jobs
 * List user's jobs
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id
    const status = req.query.status // Filter by status
    const limit = parseInt(req.query.limit) || 50
    
    let queryText = `
      SELECT * FROM jobs 
      WHERE user_id = $1
    `
    const params = [userId]
    
    if (status) {
      queryText += ` AND status = $2`
      params.push(status)
    }
    
    queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`
    params.push(limit)
    
    const result = await query(queryText, params)
    
    res.json({
      jobs: result.rows.map(formatJob)
    })
    
  } catch (error) {
    console.error('Get jobs error:', error)
    res.status(500).json({ error: 'Failed to get jobs' })
  }
})

/**
 * GET /api/jobs/:id
 * Get single job details
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id
    const jobId = req.params.id
    
    const result = await query(
      `SELECT * FROM jobs WHERE id = $1 AND user_id = $2`,
      [jobId, userId]
    )
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' })
    }
    
    res.json({ job: formatJob(result.rows[0]) })
    
  } catch (error) {
    console.error('Get job error:', error)
    res.status(500).json({ error: 'Failed to get job' })
  }
})

/**
 * POST /api/jobs
 * Create a new job
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id
    const { name, gpuType, gpuCount, hours, workloadType } = req.body
    
    // Validate GPU type
    const gpu = GPU_PRICING[gpuType]
    if (!gpu) {
      return res.status(400).json({ error: 'Invalid GPU type' })
    }
    
    // Validate inputs
    if (!gpuCount || gpuCount < 1 || gpuCount > 8) {
      return res.status(400).json({ error: 'GPU count must be 1-8' })
    }
    
    if (!hours || hours < 1 || hours > 720) {
      return res.status(400).json({ error: 'Hours must be 1-720' })
    }
    
    // Calculate cost
    const costUsd = gpu.primisRate * gpuCount * hours
    
    // Check user credits
    const creditsResult = await query(
      `SELECT balance_usd FROM credits WHERE user_id = $1`,
      [userId]
    )
    
    const balance = parseFloat(creditsResult.rows[0]?.balance_usd || 0)
    
    if (balance < costUsd) {
      return res.status(400).json({ 
        error: 'Insufficient credits',
        required: costUsd,
        available: balance
      })
    }
    
    // Deduct credits
    await query(
      `UPDATE credits 
       SET balance_usd = balance_usd - $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, costUsd]
    )
    
    // Record credit transaction
    const jobName = name || `Job ${Date.now()}`
    
    // Create job record
    const result = await query(
      `INSERT INTO jobs (user_id, name, gpu_type, gpu_count, hours, workload_type, cost_usd, status, provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
       RETURNING *`,
      [userId, jobName, gpuType, gpuCount, hours, workloadType, costUsd, process.env.RUNPOD_API_KEY ? 'runpod' : 'demo']
    )
    
    const job = result.rows[0]
    
    // Record credit usage
    await query(
      `INSERT INTO credit_transactions (user_id, type, amount_usd, job_id, description)
       VALUES ($1, 'usage', $2, $3, $4)`,
      [userId, -costUsd, job.id, `Job: ${jobName}`]
    )
    
    // Try to create real RunPod pod if API key is configured
    let providerJobId = null
    if (process.env.RUNPOD_API_KEY && gpu.runpodId) {
      try {
        console.log(`Creating RunPod pod for job ${job.id}...`)
        const pod = await runpod.createPod({
          name: `primis-${job.id.slice(0, 8)}`,
          gpuTypeId: gpu.runpodId,
          gpuCount: gpuCount,
          imageName: 'runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04'
        })
        
        providerJobId = pod.id
        console.log(`RunPod pod created: ${pod.id}`)
        
        // Update job with provider ID and running status
        await query(
          `UPDATE jobs 
           SET provider_job_id = $2, 
               status = 'running',
               started_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [job.id, providerJobId]
        )
        job.provider_job_id = providerJobId
        job.status = 'running'
        job.started_at = new Date()
        
      } catch (runpodError) {
        console.error('RunPod pod creation failed:', runpodError.message)
        // Continue with demo mode if RunPod fails
      }
    }
    
    // If no RunPod, simulate job starting
    if (!providerJobId) {
      setTimeout(async () => {
        await query(
          `UPDATE jobs 
           SET status = 'running', 
               started_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [job.id]
        )
      }, 2000)
    }
    
    res.status(201).json({
      job: formatJob(job),
      cost: costUsd,
      newBalance: balance - costUsd,
      provider: providerJobId ? 'runpod' : 'demo'
    })
    
  } catch (error) {
    console.error('Create job error:', error)
    res.status(500).json({ error: 'Failed to create job' })
  }
})

/**
 * DELETE /api/jobs/:id
 * Terminate a job
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id
    const jobId = req.params.id
    
    // Get job
    const jobResult = await query(
      `SELECT * FROM jobs WHERE id = $1 AND user_id = $2`,
      [jobId, userId]
    )
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' })
    }
    
    const job = jobResult.rows[0]
    
    if (!['pending', 'running'].includes(job.status)) {
      return res.status(400).json({ error: 'Job cannot be terminated' })
    }
    
    // Terminate RunPod pod if exists
    if (job.provider_job_id && job.provider === 'runpod') {
      try {
        console.log(`Terminating RunPod pod: ${job.provider_job_id}`)
        await runpod.terminatePod(job.provider_job_id)
        console.log(`RunPod pod terminated: ${job.provider_job_id}`)
      } catch (runpodError) {
        console.error('Failed to terminate RunPod pod:', runpodError.message)
        // Continue with job termination even if RunPod fails
      }
    }
    
    // Calculate refund (if job was running, partial refund based on time used)
    let refundAmount = 0
    if (job.status === 'pending') {
      refundAmount = parseFloat(job.cost_usd)
    } else if (job.status === 'running' && job.started_at) {
      const hoursUsed = (Date.now() - new Date(job.started_at).getTime()) / (1000 * 60 * 60)
      const hoursRemaining = Math.max(0, parseFloat(job.hours) - hoursUsed)
      const hourlyRate = parseFloat(job.cost_usd) / parseFloat(job.hours)
      refundAmount = hourlyRate * hoursRemaining
    }
    
    // Update job status
    await query(
      `UPDATE jobs 
       SET status = 'terminated', 
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [jobId]
    )
    
    // Refund credits
    if (refundAmount > 0) {
      await query(
        `UPDATE credits 
         SET balance_usd = balance_usd + $2,
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId, refundAmount]
      )
      
      await query(
        `INSERT INTO credit_transactions (user_id, type, amount_usd, job_id, description)
         VALUES ($1, 'refund', $2, $3, $4)`,
        [userId, refundAmount, jobId, `Refund for terminated job: ${job.name}`]
      )
    }
    
    // Get new balance
    const creditsResult = await query(
      `SELECT balance_usd FROM credits WHERE user_id = $1`,
      [userId]
    )
    
    res.json({
      message: 'Job terminated',
      refund: refundAmount,
      newBalance: parseFloat(creditsResult.rows[0].balance_usd)
    })
    
  } catch (error) {
    console.error('Terminate job error:', error)
    res.status(500).json({ error: 'Failed to terminate job' })
  }
})

/**
 * GET /api/jobs/credits/balance
 * Get user's credit balance
 */
router.get('/credits/balance', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id
    
    const result = await query(
      `SELECT balance_usd FROM credits WHERE user_id = $1`,
      [userId]
    )
    
    res.json({
      balance: parseFloat(result.rows[0]?.balance_usd || 0)
    })
    
  } catch (error) {
    console.error('Get credits error:', error)
    res.status(500).json({ error: 'Failed to get credits' })
  }
})

/**
 * GET /api/jobs/credits/history
 * Get credit transaction history
 */
router.get('/credits/history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id
    const limit = parseInt(req.query.limit) || 50
    
    const result = await query(
      `SELECT * FROM credit_transactions 
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    )
    
    res.json({
      transactions: result.rows.map(t => ({
        id: t.id,
        type: t.type,
        amountUsd: parseFloat(t.amount_usd),
        description: t.description,
        jobId: t.job_id,
        createdAt: t.created_at
      }))
    })
    
  } catch (error) {
    console.error('Get credit history error:', error)
    res.status(500).json({ error: 'Failed to get credit history' })
  }
})

/**
 * POST /api/jobs/:id/sync
 * Sync job status from RunPod
 */
router.post('/:id/sync', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id
    const jobId = req.params.id
    
    const jobResult = await query(
      `SELECT * FROM jobs WHERE id = $1 AND user_id = $2`,
      [jobId, userId]
    )
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' })
    }
    
    const job = jobResult.rows[0]
    
    // Only sync if it's a RunPod job and still running
    if (job.provider !== 'runpod' || !job.provider_job_id) {
      return res.json({ job: formatJob(job), synced: false })
    }
    
    if (!['pending', 'running'].includes(job.status)) {
      return res.json({ job: formatJob(job), synced: false })
    }
    
    try {
      const pod = await runpod.getPod(job.provider_job_id)
      
      if (!pod) {
        // Pod doesn't exist anymore - mark as completed
        await query(
          `UPDATE jobs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
          [jobId]
        )
        job.status = 'completed'
      } else {
        // Calculate progress based on uptime
        const uptimeHours = (pod.runtime?.uptimeInSeconds || 0) / 3600
        const progress = Math.min(100, (uptimeHours / parseFloat(job.hours)) * 100)
        
        // Check if job should be completed
        if (progress >= 100) {
          await query(
            `UPDATE jobs SET status = 'completed', progress = 100, completed_at = NOW() WHERE id = $1`,
            [jobId]
          )
          job.status = 'completed'
          job.progress = 100
          
          // Auto-terminate the pod
          try {
            await runpod.terminatePod(job.provider_job_id)
          } catch (e) {
            console.log('Auto-terminate failed:', e.message)
          }
        } else {
          await query(
            `UPDATE jobs SET progress = $2 WHERE id = $1`,
            [jobId, Math.floor(progress)]
          )
          job.progress = Math.floor(progress)
        }
      }
      
      return res.json({ job: formatJob(job), synced: true })
      
    } catch (runpodError) {
      console.error('RunPod sync error:', runpodError.message)
      return res.json({ job: formatJob(job), synced: false, error: runpodError.message })
    }
    
  } catch (error) {
    console.error('Job sync error:', error)
    res.status(500).json({ error: 'Failed to sync job' })
  }
})

/**
 * GET /api/jobs/runpod/pods
 * Get all active RunPod pods (admin/debug)
 */
router.get('/runpod/pods', requireAuth, async (req, res) => {
  try {
    if (!process.env.RUNPOD_API_KEY) {
      return res.json({ pods: [], connected: false })
    }
    
    const pods = await runpod.getMyPods()
    res.json({ pods, connected: true })
    
  } catch (error) {
    console.error('Get pods error:', error)
    res.status(500).json({ error: 'Failed to get pods' })
  }
})

// Helper to format job response
function formatJob(row) {
  const gpu = GPU_PRICING[row.gpu_type] || {}
  return {
    id: row.id,
    name: row.name,
    gpuType: row.gpu_type,
    gpuName: gpu.name,
    gpuCount: row.gpu_count,
    hours: parseFloat(row.hours),
    workloadType: row.workload_type,
    status: row.status,
    progress: row.progress,
    costUsd: parseFloat(row.cost_usd),
    provider: row.provider,
    providerJobId: row.provider_job_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at
  }
}

export default router
