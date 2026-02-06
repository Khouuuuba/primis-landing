/**
 * Anthropic API Proxy for Moltbot Instances
 * 
 * Sprint R2: Rate-Limited API Proxy
 * 
 * Instead of each Moltbot instance hitting Anthropic directly (sharing one
 * org-level rate limit), they route through this proxy which:
 * 
 * 1. Enforces per-instance token budgets
 * 2. Queues requests when approaching the org rate limit
 * 3. Retries with backoff on 429 errors
 * 4. Tracks usage per instance for monitoring
 * 5. Forces model downgrades if rate limits are tight
 * 
 * Moltbot instances set ANTHROPIC_API_BASE_URL to point here.
 * 
 * Routes:
 * - POST /api/anthropic-proxy/v1/messages  - Proxied messages.create
 * - GET  /api/anthropic-proxy/stats        - Usage statistics
 */

import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { 
  estimateMessagesTokens,
  estimateTokenCount,
  getModelFamily,
  isRateLimitError,
  isRetryableError
} from '../utils/anthropic-rate-limiter.js'

const router = Router()

// ============================================================================
// CONFIGURATION
// ============================================================================

// Org-level rate limits (tokens per minute)
const ORG_LIMITS = {
  'claude-opus-4': { inputTokensPerMinute: 30000 },
  'claude-sonnet-4': { inputTokensPerMinute: 80000 },
  'default': { inputTokensPerMinute: 30000 }
}

// Safety margin - only use 75% of the org limit
const SAFETY_FACTOR = 0.75

// Max retries on 429
const MAX_RETRIES = 3

// Max concurrent requests across all instances
const MAX_CONCURRENT = 5

// Per-instance daily token budget (prevent one bot from hogging everything)
const DAILY_TOKEN_BUDGET_PER_INSTANCE = 500000 // 500k tokens/day

// ============================================================================
// STATE TRACKING
// ============================================================================

// Rolling window of token usage per minute (org-wide)
const orgUsageLog = [] // { timestamp, model, inputTokens, outputTokens, instanceId }

// Per-instance daily usage
const instanceDailyUsage = new Map() // instanceId -> { date, inputTokens, outputTokens, requestCount }

// Request queue
let activeRequests = 0
const requestQueue = []

// Initialize Anthropic client
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

// ============================================================================
// HELPERS
// ============================================================================

function cleanOrgUsageLog() {
  const twoMinutesAgo = Date.now() - 120000
  while (orgUsageLog.length > 0 && orgUsageLog[0].timestamp < twoMinutesAgo) {
    orgUsageLog.shift()
  }
}

function getOrgUsageLastMinute(modelFamily) {
  cleanOrgUsageLog()
  const oneMinuteAgo = Date.now() - 60000
  
  return orgUsageLog
    .filter(e => e.timestamp > oneMinuteAgo && getModelFamily(e.model) === modelFamily)
    .reduce((sum, e) => sum + e.inputTokens, 0)
}

function recordOrgUsage(model, inputTokens, outputTokens, instanceId) {
  orgUsageLog.push({
    timestamp: Date.now(),
    model,
    inputTokens,
    outputTokens,
    instanceId
  })
}

function getInstanceUsageToday(instanceId) {
  const today = new Date().toISOString().split('T')[0]
  const usage = instanceDailyUsage.get(instanceId)
  
  if (!usage || usage.date !== today) {
    // Reset for new day
    const newUsage = { date: today, inputTokens: 0, outputTokens: 0, requestCount: 0 }
    instanceDailyUsage.set(instanceId, newUsage)
    return newUsage
  }
  
  return usage
}

function recordInstanceUsage(instanceId, inputTokens, outputTokens) {
  const usage = getInstanceUsageToday(instanceId)
  usage.inputTokens += inputTokens
  usage.outputTokens += outputTokens
  usage.requestCount += 1
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Wait until we have capacity to make a request
 */
async function waitForCapacity(modelFamily, estimatedInputTokens) {
  const limits = ORG_LIMITS[modelFamily] || ORG_LIMITS.default
  const safeLimit = limits.inputTokensPerMinute * SAFETY_FACTOR
  
  let waited = 0
  const maxWait = 60000 // Max 60 seconds
  
  while (waited < maxWait) {
    const currentUsage = getOrgUsageLastMinute(modelFamily)
    
    if (currentUsage + estimatedInputTokens <= safeLimit && activeRequests < MAX_CONCURRENT) {
      return true // We have capacity
    }
    
    // Wait and check again
    const waitMs = 2000
    await sleep(waitMs)
    waited += waitMs
  }
  
  // Timed out waiting for capacity - let it through anyway (will get 429 and retry)
  return false
}

/**
 * Process queued requests
 */
function processQueue() {
  while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
    const next = requestQueue.shift()
    if (next) {
      next.resolve()
    }
  }
}

/**
 * Wait in queue if too many concurrent requests
 */
function enqueue() {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++
    return Promise.resolve()
  }
  
  return new Promise(resolve => {
    requestQueue.push({ resolve })
  }).then(() => {
    activeRequests++
  })
}

function dequeue() {
  activeRequests = Math.max(0, activeRequests - 1)
  processQueue()
}

// ============================================================================
// PROXY ROUTE
// ============================================================================

/**
 * POST /api/anthropic-proxy/v1/messages
 * 
 * Proxied version of Anthropic's messages.create endpoint.
 * Moltbot instances call this instead of Anthropic directly.
 * 
 * Headers:
 *   x-instance-id: The Moltbot instance ID (for tracking)
 *   x-api-key or Authorization: Ignored (we use Primis's key)
 *   anthropic-version: Passed through
 */
router.post('/v1/messages', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({
      type: 'error',
      error: { type: 'api_error', message: 'Anthropic API not configured' }
    })
  }

  const instanceId = req.headers['x-instance-id'] || 'unknown'
  const requestedModel = req.body.model || 'claude-sonnet-4-20250514'
  
  // Force model override: never allow Opus through the proxy
  let model = requestedModel
  if (model.includes('opus')) {
    model = 'claude-sonnet-4-20250514'
    console.log(`[proxy] Instance ${instanceId}: Downgraded model from ${requestedModel} to ${model}`)
  }

  const modelFamily = getModelFamily(model)

  // Estimate input tokens
  const estimatedInputTokens = estimateMessagesTokens(req.body.messages) +
    estimateTokenCount(req.body.system || '')

  // Check per-instance daily budget
  const instanceUsage = getInstanceUsageToday(instanceId)
  if (instanceUsage.inputTokens + estimatedInputTokens > DAILY_TOKEN_BUDGET_PER_INSTANCE) {
    console.warn(`[proxy] Instance ${instanceId}: Daily token budget exceeded (${instanceUsage.inputTokens}/${DAILY_TOKEN_BUDGET_PER_INSTANCE})`)
    return res.status(429).json({
      type: 'error',
      error: {
        type: 'rate_limit_error',
        message: `Daily token budget exceeded for this instance. Resets at midnight UTC. Used: ${instanceUsage.inputTokens}, Limit: ${DAILY_TOKEN_BUDGET_PER_INSTANCE}`
      }
    })
  }

  // Wait for org-level capacity
  await waitForCapacity(modelFamily, estimatedInputTokens)
  
  // Wait in concurrency queue
  await enqueue()

  try {
    let lastError = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Record pre-request usage estimate
        recordOrgUsage(model, estimatedInputTokens, 0, instanceId)

        // Make the actual API call
        const result = await anthropic.messages.create({
          ...req.body,
          model // Use our (possibly overridden) model
        })

        // Record actual usage
        const actualInput = result.usage?.input_tokens || estimatedInputTokens
        const actualOutput = result.usage?.output_tokens || 0
        recordInstanceUsage(instanceId, actualInput, actualOutput)

        // Log success
        if (attempt > 0) {
          console.log(`[proxy] Instance ${instanceId}: Succeeded after ${attempt} retries`)
        }

        // Return the response
        dequeue()
        return res.json(result)

      } catch (error) {
        lastError = error

        if (!isRetryableError(error) || attempt >= MAX_RETRIES) {
          break
        }

        // Calculate retry delay
        let delayMs
        if (isRateLimitError(error)) {
          // On 429, wait longer - respect the rate limit window
          delayMs = Math.min(15000 * (attempt + 1), 60000)
          console.warn(`[proxy] Instance ${instanceId}: Rate limited (429), retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`)
        } else {
          delayMs = 2000 * Math.pow(2, attempt)
          console.warn(`[proxy] Instance ${instanceId}: Error ${error.status}, retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`)
        }

        await sleep(delayMs)
      }
    }

    // All retries exhausted
    dequeue()
    
    const status = lastError?.status || 500
    const errorBody = {
      type: 'error',
      error: {
        type: isRateLimitError(lastError) ? 'rate_limit_error' : 'api_error',
        message: lastError?.message || 'Request failed after retries'
      }
    }

    console.error(`[proxy] Instance ${instanceId}: All retries exhausted. Error: ${lastError?.message}`)
    return res.status(status).json(errorBody)

  } catch (error) {
    dequeue()
    console.error(`[proxy] Instance ${instanceId}: Unexpected error:`, error.message)
    return res.status(500).json({
      type: 'error',
      error: { type: 'api_error', message: error.message }
    })
  }
})

// ============================================================================
// STATS ENDPOINT
// ============================================================================

/**
 * GET /api/anthropic-proxy/stats
 * Usage statistics for monitoring
 */
router.get('/stats', (req, res) => {
  cleanOrgUsageLog()
  const oneMinuteAgo = Date.now() - 60000

  // Org-level usage per model family
  const orgUsage = {}
  for (const entry of orgUsageLog.filter(e => e.timestamp > oneMinuteAgo)) {
    const family = getModelFamily(entry.model)
    if (!orgUsage[family]) {
      orgUsage[family] = { inputTokens: 0, requests: 0 }
    }
    orgUsage[family].inputTokens += entry.inputTokens
    orgUsage[family].requests += 1
  }

  // Add limit info
  for (const [family, limits] of Object.entries(ORG_LIMITS)) {
    if (family === 'default') continue
    if (!orgUsage[family]) {
      orgUsage[family] = { inputTokens: 0, requests: 0 }
    }
    orgUsage[family].limit = limits.inputTokensPerMinute
    orgUsage[family].safeLimit = Math.floor(limits.inputTokensPerMinute * SAFETY_FACTOR)
    orgUsage[family].utilization = Math.round(
      (orgUsage[family].inputTokens / (limits.inputTokensPerMinute * SAFETY_FACTOR)) * 100
    )
  }

  // Per-instance daily usage
  const instanceUsages = []
  for (const [instanceId, usage] of instanceDailyUsage.entries()) {
    instanceUsages.push({
      instanceId,
      ...usage,
      budgetUsed: Math.round((usage.inputTokens / DAILY_TOKEN_BUDGET_PER_INSTANCE) * 100)
    })
  }

  res.json({
    timestamp: new Date().toISOString(),
    proxy: {
      activeRequests,
      queuedRequests: requestQueue.length,
      maxConcurrent: MAX_CONCURRENT
    },
    orgUsageLastMinute: orgUsage,
    instanceUsageToday: instanceUsages,
    config: {
      safetyFactor: SAFETY_FACTOR,
      maxRetries: MAX_RETRIES,
      dailyBudgetPerInstance: DAILY_TOKEN_BUDGET_PER_INSTANCE
    }
  })
})

export default router
