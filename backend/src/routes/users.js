import { Router } from 'express'
import { query } from '../db/connection.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

/**
 * GET /api/users/profile
 * Get user profile with portfolio summary
 */
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id
    
    // Get user with portfolio data
    const portfolioResult = await query(
      'SELECT * FROM user_portfolio WHERE user_id = $1',
      [userId]
    )
    
    // Get credits (for AI Builder)
    const creditsResult = await query(
      'SELECT balance_usd FROM credits WHERE user_id = $1',
      [userId]
    )
    
    // Get jobs summary
    const jobsResult = await query(
      'SELECT * FROM user_jobs_summary WHERE user_id = $1',
      [userId]
    )
    
    const portfolio = portfolioResult.rows[0] || {}
    const credits = creditsResult.rows[0] || { balance_usd: 0 }
    const jobs = jobsResult.rows[0] || {}
    
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        walletAddress: req.user.wallet_address,
        userType: req.user.user_type,
        createdAt: req.user.created_at
      },
      capitalProvider: {
        totalStaked: parseFloat(portfolio.total_staked || 0),
        totalYieldEarned: parseFloat(portfolio.total_yield_earned || 0),
        totalRevenueEarned: parseFloat(portfolio.total_revenue_earned || 0),
        totalEarned: parseFloat(portfolio.total_earned || 0)
      },
      aiBuilder: {
        creditBalance: parseFloat(credits.balance_usd || 0),
        activeJobs: parseInt(jobs.active_jobs || 0),
        completedJobs: parseInt(jobs.completed_jobs || 0),
        totalSpent: parseFloat(jobs.total_spent || 0)
      }
    })
    
  } catch (error) {
    console.error('Profile error:', error)
    res.status(500).json({ error: 'Failed to get profile' })
  }
})

/**
 * PATCH /api/users/profile
 * Update user profile
 */
router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id
    const { userType, walletAddress } = req.body
    
    const result = await query(
      `UPDATE users 
       SET user_type = COALESCE($2, user_type),
           wallet_address = COALESCE($3, wallet_address),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [userId, userType, walletAddress]
    )
    
    res.json({ user: result.rows[0] })
    
  } catch (error) {
    console.error('Update profile error:', error)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

export default router
