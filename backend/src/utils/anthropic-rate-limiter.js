/**
 * Anthropic API Rate Limiter
 * 
 * Handles rate limiting for Anthropic Claude API calls with:
 * - Token-aware rate tracking per minute
 * - Automatic retry with exponential backoff on 429 errors
 * - Request queuing to prevent burst overloads
 * - Per-model rate limit configuration
 * 
 * Default rate limits (Anthropic Tier 1):
 * - claude-opus-4-5: 30,000 input tokens/min, 10,000 output tokens/min
 * - claude-sonnet-4: 80,000 input tokens/min, 40,000 output tokens/min
 */

// Rate limit configurations per model family
const MODEL_RATE_LIMITS = {
  'claude-opus-4': {
    inputTokensPerMinute: 30000,
    outputTokensPerMinute: 10000,
    requestsPerMinute: 30,
    // Use 80% of the limit as a safety margin
    safeInputTokensPerMinute: 24000,
    safeRequestsPerMinute: 24
  },
  'claude-sonnet-4': {
    inputTokensPerMinute: 80000,
    outputTokensPerMinute: 40000,
    requestsPerMinute: 60,
    safeInputTokensPerMinute: 64000,
    safeRequestsPerMinute: 48
  },
  'default': {
    inputTokensPerMinute: 30000,
    outputTokensPerMinute: 10000,
    requestsPerMinute: 30,
    safeInputTokensPerMinute: 24000,
    safeRequestsPerMinute: 24
  }
}

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 4,
  baseDelayMs: 2000,    // Start with 2 seconds
  maxDelayMs: 64000,    // Max 64 seconds
  jitterFactor: 0.25    // Add up to 25% random jitter
}

/**
 * Simple token estimator for input text
 * Approximation: ~4 characters per token for English text
 */
function estimateTokenCount(text) {
  if (!text) return 0
  if (typeof text !== 'string') {
    text = JSON.stringify(text)
  }
  // ~4 chars per token is a reasonable approximation for English text
  return Math.ceil(text.length / 4)
}

/**
 * Estimate tokens for a messages array
 */
function estimateMessagesTokens(messages) {
  if (!messages || !Array.isArray(messages)) return 0
  
  let totalTokens = 0
  for (const msg of messages) {
    // Role overhead (~4 tokens)
    totalTokens += 4
    
    if (typeof msg.content === 'string') {
      totalTokens += estimateTokenCount(msg.content)
    } else if (Array.isArray(msg.content)) {
      // Handle content blocks (text, image, etc.)
      for (const block of msg.content) {
        if (block.type === 'text') {
          totalTokens += estimateTokenCount(block.text)
        }
        // Image blocks are harder to estimate, add a rough number
        if (block.type === 'image') {
          totalTokens += 1000
        }
      }
    }
  }
  
  // Add system prompt overhead
  totalTokens += 10
  
  return totalTokens
}

/**
 * Token usage tracker per model family
 * Tracks rolling window of token usage per minute
 */
class TokenUsageTracker {
  constructor() {
    // Map of model family -> array of { timestamp, inputTokens, outputTokens }
    this.usageLog = new Map()
  }

  /**
   * Record token usage for a model
   */
  record(modelFamily, inputTokens, outputTokens = 0) {
    if (!this.usageLog.has(modelFamily)) {
      this.usageLog.set(modelFamily, [])
    }
    
    this.usageLog.get(modelFamily).push({
      timestamp: Date.now(),
      inputTokens,
      outputTokens
    })
    
    // Clean up old entries (older than 2 minutes)
    this._cleanup(modelFamily)
  }

  /**
   * Get current usage for a model family in the last minute
   */
  getCurrentUsage(modelFamily) {
    this._cleanup(modelFamily)
    
    const entries = this.usageLog.get(modelFamily) || []
    const oneMinuteAgo = Date.now() - 60000
    
    const recentEntries = entries.filter(e => e.timestamp > oneMinuteAgo)
    
    return {
      inputTokens: recentEntries.reduce((sum, e) => sum + e.inputTokens, 0),
      outputTokens: recentEntries.reduce((sum, e) => sum + e.outputTokens, 0),
      requestCount: recentEntries.length
    }
  }

  /**
   * Check if we can make a request with the estimated token count
   */
  canMakeRequest(modelFamily, estimatedInputTokens) {
    const limits = MODEL_RATE_LIMITS[modelFamily] || MODEL_RATE_LIMITS.default
    const usage = this.getCurrentUsage(modelFamily)
    
    return {
      allowed: (usage.inputTokens + estimatedInputTokens) <= limits.safeInputTokensPerMinute 
               && usage.requestCount < limits.safeRequestsPerMinute,
      currentInputTokens: usage.inputTokens,
      limitInputTokens: limits.safeInputTokensPerMinute,
      remainingInputTokens: Math.max(0, limits.safeInputTokensPerMinute - usage.inputTokens),
      requestCount: usage.requestCount,
      requestLimit: limits.safeRequestsPerMinute
    }
  }

  /**
   * Get estimated wait time until we can make a request
   */
  getWaitTime(modelFamily, estimatedInputTokens) {
    const check = this.canMakeRequest(modelFamily, estimatedInputTokens)
    
    if (check.allowed) return 0
    
    // Find the oldest entry in the window and calculate when it expires
    const entries = this.usageLog.get(modelFamily) || []
    const oneMinuteAgo = Date.now() - 60000
    const recentEntries = entries
      .filter(e => e.timestamp > oneMinuteAgo)
      .sort((a, b) => a.timestamp - b.timestamp)
    
    if (recentEntries.length === 0) return 0
    
    // Wait until the oldest entry falls out of the 1-minute window
    const oldestTimestamp = recentEntries[0].timestamp
    const waitMs = (oldestTimestamp + 60000) - Date.now() + 1000 // +1s safety margin
    
    return Math.max(0, waitMs)
  }

  _cleanup(modelFamily) {
    const entries = this.usageLog.get(modelFamily)
    if (!entries) return
    
    const twoMinutesAgo = Date.now() - 120000
    const cleaned = entries.filter(e => e.timestamp > twoMinutesAgo)
    this.usageLog.set(modelFamily, cleaned)
  }
}

// Singleton tracker
const tracker = new TokenUsageTracker()

// Request queue per model family
const requestQueues = new Map()

/**
 * Get the model family from a model name
 * e.g. 'claude-opus-4-20250514' -> 'claude-opus-4'
 */
function getModelFamily(modelName) {
  if (!modelName) return 'default'
  
  if (modelName.includes('opus')) return 'claude-opus-4'
  if (modelName.includes('sonnet')) return 'claude-sonnet-4'
  if (modelName.includes('haiku')) return 'claude-sonnet-4' // Haiku has similar limits to sonnet
  
  return 'default'
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateBackoffDelay(attempt) {
  const baseDelay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt)
  const cappedDelay = Math.min(baseDelay, RETRY_CONFIG.maxDelayMs)
  const jitter = cappedDelay * RETRY_CONFIG.jitterFactor * Math.random()
  return Math.floor(cappedDelay + jitter)
}

/**
 * Parse rate limit headers from Anthropic API response
 */
function parseRateLimitHeaders(error) {
  const headers = error?.headers || error?.response?.headers
  if (!headers) return null
  
  return {
    requestsLimit: parseInt(headers['anthropic-ratelimit-requests-limit'] || '0'),
    requestsRemaining: parseInt(headers['anthropic-ratelimit-requests-remaining'] || '0'),
    requestsReset: headers['anthropic-ratelimit-requests-reset'],
    tokensLimit: parseInt(headers['anthropic-ratelimit-tokens-limit'] || '0'),
    tokensRemaining: parseInt(headers['anthropic-ratelimit-tokens-remaining'] || '0'),
    tokensReset: headers['anthropic-ratelimit-tokens-reset'],
    retryAfter: parseInt(headers['retry-after'] || '0')
  }
}

/**
 * Get wait time from a 429 error (from headers or calculated)
 */
function getRetryAfterMs(error, attempt) {
  // Try to get retry-after from headers
  const rateLimitInfo = parseRateLimitHeaders(error)
  
  if (rateLimitInfo?.retryAfter > 0) {
    // Retry-After header value in seconds
    return rateLimitInfo.retryAfter * 1000 + 500 // +500ms safety
  }
  
  if (rateLimitInfo?.tokensReset) {
    // Calculate wait from reset timestamp
    const resetTime = new Date(rateLimitInfo.tokensReset).getTime()
    const waitMs = resetTime - Date.now() + 1000 // +1s safety
    if (waitMs > 0 && waitMs < 120000) {
      return waitMs
    }
  }
  
  // Fallback to exponential backoff
  return calculateBackoffDelay(attempt)
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Check if an error is a rate limit error (429)
 */
function isRateLimitError(error) {
  if (!error) return false
  
  // Check status code
  if (error.status === 429) return true
  if (error.statusCode === 429) return true
  
  // Check error type
  if (error.type === 'rate_limit_error') return true
  if (error.error?.type === 'rate_limit_error') return true
  
  // Check message
  const msg = error.message || ''
  if (msg.includes('rate_limit') || msg.includes('429') || msg.includes('rate limit')) return true
  
  return false
}

/**
 * Check if an error is a transient/retryable error
 */
function isRetryableError(error) {
  if (isRateLimitError(error)) return true
  
  // Also retry on 5xx server errors and connection errors
  const status = error.status || error.statusCode
  if (status >= 500 && status < 600) return true
  
  // Network/connection errors
  const msg = error.message || ''
  if (msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND')) return true
  if (msg.includes('overloaded') || msg.includes('capacity')) return true
  
  return false
}

/**
 * Execute an Anthropic API call with rate limiting and retry logic
 * 
 * @param {Function} apiCall - Async function that makes the API call
 * @param {Object} options - Configuration options
 * @param {string} options.model - Model name for rate limit tracking
 * @param {number} options.estimatedInputTokens - Estimated input token count
 * @param {number} options.maxRetries - Override max retries (default: 4)
 * @param {string} options.operationName - Name for logging
 * @returns {Promise} - The API response
 */
async function withRateLimit(apiCall, options = {}) {
  const {
    model = 'claude-opus-4-20250514',
    estimatedInputTokens = 0,
    maxRetries = RETRY_CONFIG.maxRetries,
    operationName = 'api-call'
  } = options

  const modelFamily = getModelFamily(model)
  
  // Pre-flight check: wait if we're near the rate limit
  const waitTime = tracker.getWaitTime(modelFamily, estimatedInputTokens)
  if (waitTime > 0) {
    console.log(`[rate-limiter] ${operationName}: Waiting ${(waitTime / 1000).toFixed(1)}s before request (token budget nearly exhausted)`)
    await sleep(waitTime)
  }

  // Log pre-request state
  const preCheck = tracker.canMakeRequest(modelFamily, estimatedInputTokens)
  console.log(`[rate-limiter] ${operationName}: Model=${modelFamily}, EstTokens=${estimatedInputTokens}, ` +
    `Used=${preCheck.currentInputTokens}/${preCheck.limitInputTokens}, Requests=${preCheck.requestCount}/${preCheck.requestLimit}`)

  let lastError = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Record estimated usage before the call
      tracker.record(modelFamily, estimatedInputTokens)
      
      const result = await apiCall()
      
      // If we got usage info from the response, update our tracking
      if (result?.usage) {
        // Adjust: we estimated before, now correct with actual
        const actualInput = result.usage.input_tokens || 0
        const difference = actualInput - estimatedInputTokens
        if (difference > 0) {
          tracker.record(modelFamily, difference, result.usage.output_tokens || 0)
        }
      }
      
      if (attempt > 0) {
        console.log(`[rate-limiter] ${operationName}: Succeeded after ${attempt} retries`)
      }
      
      return result
    } catch (error) {
      lastError = error
      
      if (!isRetryableError(error) || attempt >= maxRetries) {
        // Non-retryable or exhausted retries
        if (attempt >= maxRetries) {
          console.error(`[rate-limiter] ${operationName}: All ${maxRetries} retries exhausted`)
        }
        throw error
      }
      
      // Calculate delay
      let delayMs
      if (isRateLimitError(error)) {
        delayMs = getRetryAfterMs(error, attempt)
        console.warn(`[rate-limiter] ${operationName}: Rate limited (429). Retry ${attempt + 1}/${maxRetries} after ${(delayMs / 1000).toFixed(1)}s`)
      } else {
        delayMs = calculateBackoffDelay(attempt)
        console.warn(`[rate-limiter] ${operationName}: Transient error (${error.status || error.message}). ` +
          `Retry ${attempt + 1}/${maxRetries} after ${(delayMs / 1000).toFixed(1)}s`)
      }
      
      await sleep(delayMs)
    }
  }
  
  throw lastError
}

/**
 * Create a rate-limited wrapper around the Anthropic client
 * 
 * @param {Object} anthropicClient - Anthropic SDK client instance
 * @returns {Object} - Wrapped client with rate-limited message creation
 */
function createRateLimitedClient(anthropicClient) {
  if (!anthropicClient) return null
  
  return {
    messages: {
      /**
       * Rate-limited version of anthropic.messages.create()
       */
      create: async (params, options = {}) => {
        const estimatedInputTokens = estimateMessagesTokens(params.messages) + 
          estimateTokenCount(params.system || '')
        
        const operationName = options.operationName || `messages.create(${params.model})`
        
        return withRateLimit(
          () => anthropicClient.messages.create(params),
          {
            model: params.model,
            estimatedInputTokens,
            maxRetries: options.maxRetries,
            operationName
          }
        )
      }
    },
    
    // Expose the underlying client for non-rate-limited operations
    _client: anthropicClient
  }
}

/**
 * Get current rate limit status for monitoring
 */
function getRateLimitStatus() {
  const status = {}
  
  for (const [family, limits] of Object.entries(MODEL_RATE_LIMITS)) {
    if (family === 'default') continue
    
    const usage = tracker.getCurrentUsage(family)
    status[family] = {
      inputTokensUsed: usage.inputTokens,
      inputTokensLimit: limits.safeInputTokensPerMinute,
      inputTokensRemaining: Math.max(0, limits.safeInputTokensPerMinute - usage.inputTokens),
      requestCount: usage.requestCount,
      requestLimit: limits.safeRequestsPerMinute,
      utilizationPercent: Math.round((usage.inputTokens / limits.safeInputTokensPerMinute) * 100)
    }
  }
  
  return status
}

export {
  withRateLimit,
  createRateLimitedClient,
  estimateTokenCount,
  estimateMessagesTokens,
  getModelFamily,
  getRateLimitStatus,
  isRateLimitError,
  isRetryableError,
  MODEL_RATE_LIMITS,
  RETRY_CONFIG
}
