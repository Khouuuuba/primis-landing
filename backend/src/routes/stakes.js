import { Router } from 'express'
import { query } from '../db/connection.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

const MIN_STAKE_SOL = 10 // Minimum stake is 10 SOL

/**
 * GET /api/stakes/position
 * Get user's staking position and earnings
 */
router.get('/position', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id
    
    // Get active stakes
    const stakesResult = await query(
      `SELECT * FROM stakes 
       WHERE user_id = $1 AND status = 'active'
       ORDER BY staked_at DESC`,
      [userId]
    )
    
    // Get total earnings breakdown
    const earningsResult = await query(
      `SELECT 
         type,
         SUM(amount_sol) as total
       FROM earnings 
       WHERE user_id = $1
       GROUP BY type`,
      [userId]
    )
    
    // Calculate totals
    const totalStaked = stakesResult.rows.reduce(
      (sum, s) => sum + parseFloat(s.amount_sol), 0
    )
    
    const earningsMap = {}
    earningsResult.rows.forEach(e => {
      earningsMap[e.type] = parseFloat(e.total)
    })
    
    // Calculate current APY (simulated for now)
    const baseApy = 7.2 // Base staking APY
    const computeApy = 4.8 // Additional from compute revenue
    const totalApy = baseApy + computeApy
    
    res.json({
      position: {
        totalStaked,
        stakes: stakesResult.rows.map(s => ({
          id: s.id,
          amountSol: parseFloat(s.amount_sol),
          status: s.status,
          stakedAt: s.staked_at
        }))
      },
      earnings: {
        baseYield: earningsMap.base_yield || 0,
        computeRevenue: earningsMap.compute_revenue || 0,
        total: (earningsMap.base_yield || 0) + (earningsMap.compute_revenue || 0)
      },
      apy: {
        base: baseApy,
        compute: computeApy,
        total: totalApy
      }
    })
    
  } catch (error) {
    console.error('Get position error:', error)
    res.status(500).json({ error: 'Failed to get staking position' })
  }
})

/**
 * POST /api/stakes
 * Create a new stake (record intent - actual SOL transfer happens on-chain)
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id
    const { amountSol, txSignature } = req.body
    
    // Validate amount
    if (!amountSol || amountSol < MIN_STAKE_SOL) {
      return res.status(400).json({ 
        error: `Minimum stake is ${MIN_STAKE_SOL} SOL` 
      })
    }
    
    // Create stake record
    const result = await query(
      `INSERT INTO stakes (user_id, amount_sol, status)
       VALUES ($1, $2, 'active')
       RETURNING *`,
      [userId, amountSol]
    )
    
    // Update protocol stats
    await query(
      `UPDATE protocol_stats 
       SET total_staked_sol = total_staked_sol + $1,
           total_stakers = (SELECT COUNT(DISTINCT user_id) FROM stakes WHERE status = 'active'),
           updated_at = NOW()`,
      [amountSol]
    )
    
    res.status(201).json({
      stake: {
        id: result.rows[0].id,
        amountSol: parseFloat(result.rows[0].amount_sol),
        status: result.rows[0].status,
        stakedAt: result.rows[0].staked_at
      },
      message: `Successfully staked ${amountSol} SOL`
    })
    
  } catch (error) {
    console.error('Create stake error:', error)
    res.status(500).json({ error: 'Failed to create stake' })
  }
})

/**
 * POST /api/stakes/:id/unstake
 * Request unstaking (withdrawal)
 */
router.post('/:id/unstake', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id
    const stakeId = req.params.id
    
    // Get stake
    const stakeResult = await query(
      `SELECT * FROM stakes WHERE id = $1 AND user_id = $2`,
      [stakeId, userId]
    )
    
    if (stakeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Stake not found' })
    }
    
    const stake = stakeResult.rows[0]
    
    if (stake.status !== 'active') {
      return res.status(400).json({ error: 'Stake is not active' })
    }
    
    // Update stake status
    const result = await query(
      `UPDATE stakes 
       SET status = 'pending_withdrawal', 
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [stakeId]
    )
    
    res.json({
      stake: {
        id: result.rows[0].id,
        amountSol: parseFloat(result.rows[0].amount_sol),
        status: result.rows[0].status
      },
      message: 'Withdrawal requested. Processing will take 2-3 days.'
    })
    
  } catch (error) {
    console.error('Unstake error:', error)
    res.status(500).json({ error: 'Failed to unstake' })
  }
})

/**
 * GET /api/stakes/earnings/history
 * Get earnings history
 */
router.get('/earnings/history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id
    const limit = parseInt(req.query.limit) || 20
    
    const result = await query(
      `SELECT * FROM earnings 
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    )
    
    res.json({
      earnings: result.rows.map(e => ({
        id: e.id,
        type: e.type,
        amountSol: parseFloat(e.amount_sol),
        sourceJobId: e.source_job_id,
        createdAt: e.created_at
      }))
    })
    
  } catch (error) {
    console.error('Get earnings history error:', error)
    res.status(500).json({ error: 'Failed to get earnings history' })
  }
})

/**
 * GET /api/stakes/yield-rates
 * Get current yield rates
 */
router.get('/yield-rates', async (req, res) => {
  try {
    // In production, fetch real rates from Marinade, Jito, etc.
    const rates = {
      baseYield: {
        sol: 7.2,
        description: 'Native SOL staking APY'
      },
      computeRevenue: {
        current: 4.8,
        projected: 6.2,
        description: 'Additional yield from compute subsidies'
      },
      comparison: {
        primis: 12.0,
        marinade: 7.1,
        jito: 7.3,
        blaze: 6.9
      }
    }
    
    res.json(rates)
    
  } catch (error) {
    console.error('Get yield rates error:', error)
    res.status(500).json({ error: 'Failed to get yield rates' })
  }
})

export default router
