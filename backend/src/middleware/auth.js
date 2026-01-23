import { query } from '../db/connection.js'

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
