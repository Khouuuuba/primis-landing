import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { pool, testConnection } from './db/connection.js'
import { verifyStripeConnection } from './stripe.js'
import { verifyRunPodConnection } from './runpod.js'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:5177',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true
}))

// Raw body for Stripe webhooks (must be before express.json())
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }))

// JSON body parser for other routes
app.use(express.json())

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`)
  next()
})

// =====================
// HEALTH CHECK
// =====================
app.get('/api/health', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT NOW()')
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      dbTime: dbResult.rows[0].now
    })
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message
    })
  }
})

// =====================
// PROTOCOL STATS (Public) - Real-time on-chain data
// =====================
app.get('/api/stats', async (req, res) => {
  try {
    const LAMPORTS_PER_SOL = 1_000_000_000
    
    // Get LIVE on-chain vault state (TVL and staker count)
    let totalStakedSol = 0
    let totalStakers = 0
    let dataSource = 'none'
    let debugInfo = {}
    
    try {
      console.log('[/api/stats] Attempting to fetch on-chain vault state...')
      const vaultState = await getVaultState()
      console.log('[/api/stats] On-chain vault state:', JSON.stringify(vaultState))
      totalStakedSol = vaultState.totalStaked / LAMPORTS_PER_SOL
      totalStakers = vaultState.stakerCount
      dataSource = 'on-chain'
      debugInfo.vaultState = vaultState
    } catch (onChainError) {
      console.error('[/api/stats] Failed to fetch on-chain state:', onChainError.message)
      debugInfo.onChainError = onChainError.message
      dataSource = 'database-fallback'
      
      // Fallback to database if on-chain query fails
      try {
        const latestDist = await pool.query(`
          SELECT total_staked_lamports, staker_count
          FROM yield_distributions 
          ORDER BY created_at DESC 
          LIMIT 1
        `)
        if (latestDist.rows[0]) {
          totalStakedSol = Number(latestDist.rows[0].total_staked_lamports) / LAMPORTS_PER_SOL
          totalStakers = latestDist.rows[0].staker_count
          debugInfo.dbFallback = latestDist.rows[0]
        } else {
          debugInfo.dbFallback = 'no rows'
        }
      } catch (dbError) {
        console.error('[/api/stats] Database fallback also failed:', dbError.message)
        debugInfo.dbError = dbError.message
      }
    }
    
    // Get total yield revenue (network revenue) from database
    let totals = { total_yield: 0, total_to_stakers: 0, distribution_count: 0 }
    try {
      const yieldTotals = await pool.query(`
        SELECT 
          COALESCE(SUM(total_yield_lamports), 0) as total_yield,
          COALESCE(SUM(staker_share_lamports), 0) as total_to_stakers,
          COUNT(*) as distribution_count
        FROM yield_distributions
      `)
      totals = yieldTotals.rows[0] || totals
    } catch (yieldError) {
      console.error('[/api/stats] Failed to fetch yield totals:', yieldError.message)
      debugInfo.yieldError = yieldError.message
    }
    
    // Get jobs count (from batch_jobs or agent_runs)
    let jobsCount = 0
    try {
      const jobsResult = await pool.query(`
        SELECT COUNT(*) as count FROM batch_jobs WHERE status = 'completed'
      `)
      jobsCount = parseInt(jobsResult.rows[0]?.count || 0)
    } catch (e) {
      // Table might not exist, that's ok
    }
    
    const response = {
      totalStakedSol,
      totalStakers,
      totalJobsCompleted: jobsCount,
      networkRevenueSol: Number(totals?.total_yield || 0) / LAMPORTS_PER_SOL,
      stakerRevenueSol: Number(totals?.total_to_stakers || 0) / LAMPORTS_PER_SOL,
      distributionCount: Number(totals?.distribution_count || 0),
      updatedAt: new Date().toISOString(),
      source: dataSource,
      debug: debugInfo
    }
    
    console.log('[/api/stats] Returning:', JSON.stringify(response))
    res.json(response)
  } catch (error) {
    console.error('[/api/stats] Error fetching stats:', error)
    res.status(500).json({ error: 'Failed to fetch stats', message: error.message })
  }
})

// =====================
// IMPORT ROUTES
// =====================
import authRoutes from './routes/auth.js'
import usersRoutes from './routes/users.js'
import stakesRoutes from './routes/stakes.js'
import jobsRoutes from './routes/jobs.js'
import paymentsRoutes from './routes/payments.js'
import batchRoutes from './routes/batch.js'
import yieldRoutes from './routes/yield.js'
import filesRoutes from './routes/files.js'
import instancesRoutes from './routes/instances.js'
import agentsRoutes from './routes/agents.js'
import inferenceRoutes from './routes/inference.js'
import apiKeysRoutes from './routes/api-keys.js'
import providersRoutes from './routes/providers.js'
import { startScheduler, stopScheduler, getSchedulerStatus, triggerDistribution, getVaultState } from './yield-scheduler.js'

app.use('/api/auth', authRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/stakes', stakesRoutes)
app.use('/api/jobs', jobsRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/batch', batchRoutes)
app.use('/api/yield', yieldRoutes)
app.use('/api/files', filesRoutes)
app.use('/api/instances', instancesRoutes)
app.use('/api/agents', agentsRoutes)
app.use('/api/inference', inferenceRoutes)
app.use('/api/api-keys', apiKeysRoutes)
app.use('/api/providers', providersRoutes)

// =====================
// SCHEDULER ENDPOINTS
// =====================

// Get scheduler status
app.get('/api/scheduler/status', (req, res) => {
  res.json(getSchedulerStatus())
})

// Manually trigger distribution (for testing)
app.post('/api/scheduler/trigger', async (req, res) => {
  try {
    const result = await triggerDistribution()
    res.json({ success: true, result })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// =====================
// ERROR HANDLING
// =====================
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// =====================
// START SERVER
// =====================
async function start() {
  // Test database connection
  const dbConnected = await testConnection()
  if (!dbConnected) {
    console.error('❌ Failed to connect to database. Check your DATABASE_URL.')
    console.log('ℹ️  You can still start the server, but database operations will fail.')
  }
  
  // Test Stripe connection
  const stripeConnected = await verifyStripeConnection()
  
  // Test RunPod connection
  const runpodConnected = await verifyRunPodConnection()
  
  // Start yield distribution scheduler
  // Schedule: Every hour for testing, change to '0 0 * * *' for daily in production
  const yieldSchedule = process.env.YIELD_SCHEDULE || '0 * * * *' // Default: every hour
  const schedulerEnabled = process.env.ENABLE_YIELD_SCHEDULER !== 'false'
  
  if (schedulerEnabled && dbConnected) {
    startScheduler(yieldSchedule)
  }
  
  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║         PRIMIS BACKEND API                ║
╠═══════════════════════════════════════════╣
║  🚀 Server running on port ${PORT}           ║
║  📊 Health check: http://localhost:${PORT}/api/health
║  🗄️  Database: ${dbConnected ? '✅ Connected' : '❌ Not connected'}
║  💳 Stripe:   ${stripeConnected ? '✅ Connected' : '⚠️  Not configured'}
║  🖥️  RunPod:   ${runpodConnected ? '✅ Connected' : '⚠️  Not configured'}
║  ⏰ Scheduler: ${schedulerEnabled && dbConnected ? '✅ Running (' + yieldSchedule + ')' : '⚠️  Disabled'}
╚═══════════════════════════════════════════╝
    `)
  })
}

start()
