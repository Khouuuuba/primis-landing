import { Router } from 'express'
import { query } from '../db/connection.js'

const router = Router()

/**
 * POST /api/auth/verify
 * Verify a Privy user and create/update in our database
 * 
 * Body: { privyId, email, walletAddress }
 */
router.post('/verify', async (req, res) => {
  try {
    const { privyId, email, walletAddress } = req.body
    
    if (!privyId) {
      return res.status(400).json({ error: 'privyId is required' })
    }
    
    // Check if user exists
    const existing = await query(
      'SELECT * FROM users WHERE privy_id = $1',
      [privyId]
    )
    
    if (existing.rows.length > 0) {
      // Update existing user
      const updated = await query(
        `UPDATE users 
         SET email = COALESCE($2, email), 
             wallet_address = COALESCE($3, wallet_address),
             updated_at = NOW()
         WHERE privy_id = $1
         RETURNING *`,
        [privyId, email, walletAddress]
      )
      
      return res.json({
        user: formatUser(updated.rows[0]),
        isNew: false
      })
    }
    
    // Create new user
    const newUser = await query(
      `INSERT INTO users (privy_id, email, wallet_address)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [privyId, email, walletAddress]
    )
    
    // Create credits record for new user (AI Builder)
    await query(
      `INSERT INTO credits (user_id, balance_usd)
       VALUES ($1, 500.00)`, // $500 welcome credits
      [newUser.rows[0].id]
    )
    
    res.status(201).json({
      user: formatUser(newUser.rows[0]),
      isNew: true,
      welcomeCredits: 500.00
    })
    
  } catch (error) {
    console.error('Auth verify error:', error)
    res.status(500).json({ error: 'Authentication failed' })
  }
})

/**
 * GET /api/auth/me
 * Get current user (requires privyId in header)
 */
router.get('/me', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id']
    
    if (!privyId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    
    const result = await query(
      'SELECT * FROM users WHERE privy_id = $1',
      [privyId]
    )
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    res.json({ user: formatUser(result.rows[0]) })
    
  } catch (error) {
    console.error('Auth me error:', error)
    res.status(500).json({ error: 'Failed to get user' })
  }
})

// Helper to format user response
function formatUser(row) {
  return {
    id: row.id,
    privyId: row.privy_id,
    email: row.email,
    walletAddress: row.wallet_address,
    userType: row.user_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export default router
