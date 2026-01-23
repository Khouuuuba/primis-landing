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
// PROTOCOL STATS (Public)
// =====================
app.get('/api/stats', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM protocol_stats LIMIT 1')
    const stats = result.rows[0] || {
      total_staked_sol: 0,
      total_stakers: 0,
      total_jobs_completed: 0,
      total_compute_revenue_usd: 0
    }
    
    res.json({
      totalStakedSol: parseFloat(stats.total_staked_sol),
      totalStakers: stats.total_stakers,
      totalJobsCompleted: stats.total_jobs_completed,
      totalComputeRevenueUsd: parseFloat(stats.total_compute_revenue_usd),
      updatedAt: stats.updated_at
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    res.status(500).json({ error: 'Failed to fetch stats' })
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
import { startScheduler, stopScheduler, getSchedulerStatus, triggerDistribution } from './yield-scheduler.js'

app.use('/api/auth', authRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/stakes', stakesRoutes)
app.use('/api/jobs', jobsRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/batch', batchRoutes)
app.use('/api/yield', yieldRoutes)

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
