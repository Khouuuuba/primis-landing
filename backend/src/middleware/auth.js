import crypto from 'crypto'
import { query } from '../db/connection.js'

/**
 * Hash an API key for comparison (constant-time safe)
 */
function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex')
}

/**
 * Middleware to require authentication
 * Expects x-privy-id header
 * 
 * In production, you would verify the Privy JWT token here.
 * For now, we trust the privy_id passed from the frontend.
 */
export async function requireAuth(req, res, next) {
  try {
    const privyId = req.headers['x-privy-id']
    
    if (!privyId) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_AUTH_HEADER'
      })
    }
    
    // Get user from database
    let result = await query(
      'SELECT * FROM users WHERE privy_id = $1',
      [privyId]
    )
    
    // Demo mode: auto-create user if not found
    if (result.rows.length === 0) {
      console.log(`Demo mode: Auto-creating user for privy_id ${privyId}`)
      
      const createResult = await query(
        `INSERT INTO users (privy_id, user_type) 
         VALUES ($1, 'both')
         RETURNING *`,
        [privyId]
      )
      
      result = createResult
    }
    
    // Attach user to request
    req.user = result.rows[0]
    req.userId = result.rows[0].id
    req.privyId = privyId
    next()
    
  } catch (error) {
    console.error('Auth middleware error:', error)
    res.status(500).json({ 
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    })
  }
}

/**
 * Optional auth middleware
 * Attaches user if authenticated, continues anyway if not
 */
export async function optionalAuth(req, res, next) {
  try {
    const privyId = req.headers['x-privy-id']
    
    if (privyId) {
      const result = await query(
        'SELECT * FROM users WHERE privy_id = $1',
        [privyId]
      )
      
      if (result.rows.length > 0) {
        req.user = result.rows[0]
      }
    }
    
    next()
    
  } catch (error) {
    // Don't fail for optional auth
    next()
  }
}

/**
 * API Key authentication middleware
 * Authenticates requests using Bearer token in Authorization header
 * Format: Authorization: Bearer prmis_xxxxx
 * 
 * Also supports x-api-key header for compatibility
 */
export async function authenticateApiKey(req, res, next) {
  try {
    // Extract API key from headers
    let apiKey = null
    
    // Check Authorization header first (preferred)
    const authHeader = req.headers['authorization']
    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7)
    }
    
    // Fallback to x-api-key header
    if (!apiKey && req.headers['x-api-key']) {
      apiKey = req.headers['x-api-key']
    }
    
    if (!apiKey) {
      return res.status(401).json({
        error: 'API key required',
        code: 'NO_API_KEY',
        hint: 'Include your API key in the Authorization header: Bearer prmis_xxx'
      })
    }
    
    // Validate key format
    if (!apiKey.startsWith('prmis_')) {
      return res.status(401).json({
        error: 'Invalid API key format',
        code: 'INVALID_KEY_FORMAT'
      })
    }
    
    // Hash the key for lookup
    const keyHash = hashApiKey(apiKey)
    
    // Find the key in database
    const result = await query(`
      SELECT 
        ak.id as key_id,
        ak.user_id,
        ak.scopes,
        ak.rate_limit,
        ak.is_active,
        ak.expires_at,
        u.id as user_db_id,
        u.privy_id
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.key_hash = $1
    `, [keyHash])
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid API key',
        code: 'KEY_NOT_FOUND'
      })
    }
    
    const keyData = result.rows[0]
    
    // Check if key is active
    if (!keyData.is_active) {
      return res.status(401).json({
        error: 'API key has been revoked',
        code: 'KEY_REVOKED'
      })
    }
    
    // Check expiration
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return res.status(401).json({
        error: 'API key has expired',
        code: 'KEY_EXPIRED'
      })
    }
    
    // Attach user and key info to request
    req.user = {
      id: keyData.user_db_id,
      privy_id: keyData.privy_id
    }
    req.userId = keyData.user_db_id
    req.apiKey = {
      id: keyData.key_id,
      scopes: keyData.scopes,
      rateLimit: keyData.rate_limit
    }
    req.authMethod = 'api_key'
    
    // Update last_used_at (non-blocking)
    query(
      'UPDATE api_keys SET last_used_at = NOW(), request_count = request_count + 1 WHERE id = $1',
      [keyData.key_id]
    ).catch(err => console.error('Failed to update API key usage:', err))
    
    next()
    
  } catch (error) {
    console.error('API key auth error:', error)
    res.status(500).json({
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    })
  }
}

/**
 * Middleware to check required scopes
 * Use after authenticateApiKey
 * @param {string[]} requiredScopes - Scopes required for this endpoint
 */
export function requireScopes(...requiredScopes) {
  return (req, res, next) => {
    // If not API key auth, allow (Privy users have full access)
    if (req.authMethod !== 'api_key') {
      return next()
    }
    
    const userScopes = req.apiKey?.scopes || []
    
    // Admin scope grants all permissions
    if (userScopes.includes('admin')) {
      return next()
    }
    
    // Check if user has required scopes
    const hasRequired = requiredScopes.every(scope => userScopes.includes(scope))
    
    if (!hasRequired) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'SCOPE_REQUIRED',
        required: requiredScopes,
        granted: userScopes
      })
    }
    
    next()
  }
}

/**
 * Flexible auth middleware
 * Accepts either Privy auth OR API key
 * Useful for endpoints that should work for both dashboard and API access
 */
export async function flexibleAuth(req, res, next) {
  // Check for API key first
  const authHeader = req.headers['authorization']
  const apiKeyHeader = req.headers['x-api-key']
  
  if ((authHeader && authHeader.startsWith('Bearer prmis_')) || apiKeyHeader) {
    return authenticateApiKey(req, res, next)
  }
  
  // Fall back to Privy auth
  return requireAuth(req, res, next)
}

/**
 * Rate limiting middleware using sliding window algorithm
 * Default: 100 requests per minute
 * 
 * Use after authenticateApiKey to access req.apiKey.rateLimit
 */
export function rateLimit(defaultLimit = 100) {
  // In-memory store for rate limiting (use Redis in production)
  const rateLimitStore = new Map()
  
  // Clean up old entries every minute
  setInterval(() => {
    const now = Date.now()
    for (const [key, data] of rateLimitStore.entries()) {
      if (now - data.windowStart > 60000) {
        rateLimitStore.delete(key)
      }
    }
  }, 60000)
  
  return async (req, res, next) => {
    // Skip rate limiting for Privy-authenticated requests (dashboard users)
    if (req.authMethod !== 'api_key') {
      return next()
    }
    
    const apiKeyId = req.apiKey?.id
    if (!apiKeyId) {
      return next()
    }
    
    const limit = req.apiKey?.rateLimit || defaultLimit
    const now = Date.now()
    const windowKey = `${apiKeyId}`
    
    let rateLimitData = rateLimitStore.get(windowKey)
    
    // Check if we're in a new window
    if (!rateLimitData || now - rateLimitData.windowStart > 60000) {
      // New window
      rateLimitData = {
        windowStart: now,
        count: 1
      }
      rateLimitStore.set(windowKey, rateLimitData)
    } else {
      // Same window, increment count
      rateLimitData.count++
      rateLimitStore.set(windowKey, rateLimitData)
    }
    
    // Calculate remaining and reset time
    const remaining = Math.max(0, limit - rateLimitData.count)
    const resetTime = Math.ceil((rateLimitData.windowStart + 60000 - now) / 1000)
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limit)
    res.setHeader('X-RateLimit-Remaining', remaining)
    res.setHeader('X-RateLimit-Reset', resetTime)
    
    // Check if limit exceeded
    if (rateLimitData.count > limit) {
      res.setHeader('Retry-After', resetTime)
      return res.status(429).json({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        limit: limit,
        remaining: 0,
        resetIn: resetTime,
        retryAfter: resetTime
      })
    }
    
    // Log to database (non-blocking, for analytics)
    if (req.apiKey?.id) {
      const endpoint = req.originalUrl || req.url
      const method = req.method
      
      // We'll log response time after request completes
      const startTime = Date.now()
      res.on('finish', () => {
        const responseTime = Date.now() - startTime
        query(`
          INSERT INTO api_key_usage (api_key_id, endpoint, method, status_code, response_time_ms, ip_address, user_agent)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          req.apiKey.id,
          endpoint,
          method,
          res.statusCode,
          responseTime,
          req.ip || req.headers['x-forwarded-for'] || 'unknown',
          req.headers['user-agent'] || 'unknown'
        ]).catch(err => console.error('Failed to log API usage:', err))
      })
    }
    
    next()
  }
}
