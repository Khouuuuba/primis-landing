import express from 'express';
import { query } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { calculateUserAPY, getRevenueModelStats } from '../yield-scheduler.js';

const router = express.Router();

const LAMPORTS_PER_SOL = 1_000_000_000;

// GET /api/yield/stats - Get current yield statistics
router.get('/stats', async (req, res) => {
  try {
    // Get latest distribution
    const latestDist = await query(`
      SELECT * FROM yield_distributions 
      ORDER BY distributed_at DESC 
      LIMIT 1
    `);
    
    // Get total distributed
    const totals = await query(`
      SELECT 
        COALESCE(SUM(total_yield_lamports), 0) as total_distributed,
        COALESCE(SUM(staker_share_lamports), 0) as total_to_stakers,
        COALESCE(SUM(subsidy_share_lamports), 0) as total_to_subsidy,
        COALESCE(SUM(reserve_share_lamports), 0) as total_to_reserve,
        COUNT(*) as distribution_count
      FROM yield_distributions
    `);
    
    // Get 7-day APY trend
    const weeklySnapshots = await query(`
      SELECT date, daily_apy_percent, total_staked_sol
      FROM yield_snapshots
      WHERE date >= NOW() - INTERVAL '7 days'
      ORDER BY date ASC
    `);
    
    res.json({
      success: true,
      stats: {
        lastDistribution: latestDist.rows[0] || null,
        totals: {
          distributedSOL: Number(totals.rows[0]?.total_distributed || 0) / LAMPORTS_PER_SOL,
          toStakersSOL: Number(totals.rows[0]?.total_to_stakers || 0) / LAMPORTS_PER_SOL,
          toSubsidySOL: Number(totals.rows[0]?.total_to_subsidy || 0) / LAMPORTS_PER_SOL,
          toReserveSOL: Number(totals.rows[0]?.total_to_reserve || 0) / LAMPORTS_PER_SOL,
          distributionCount: Number(totals.rows[0]?.distribution_count || 0),
        },
        weeklyTrend: weeklySnapshots.rows,
      },
    });
  } catch (error) {
    console.error('Error fetching yield stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch yield stats' });
  }
});

// GET /api/yield/distributions - Get distribution history
router.get('/distributions', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    
    const distributions = await query(`
      SELECT 
        id,
        total_yield_lamports / $1::numeric as total_yield_sol,
        staker_share_lamports / $1::numeric as staker_share_sol,
        subsidy_share_lamports / $1::numeric as subsidy_share_sol,
        reserve_share_lamports / $1::numeric as reserve_share_sol,
        total_staked_lamports / $1::numeric as total_staked_sol,
        staker_count,
        source,
        tx_signature,
        distributed_at
      FROM yield_distributions
      ORDER BY distributed_at DESC
      LIMIT $2 OFFSET $3
    `, [LAMPORTS_PER_SOL, limit, offset]);
    
    const countResult = await query('SELECT COUNT(*) FROM yield_distributions');
    
    res.json({
      success: true,
      distributions: distributions.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching distributions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch distributions' });
  }
});

// GET /api/yield/claimable/:wallet - Get claimable yield for a wallet
router.get('/claimable/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    
    // This is a simplified calculation for demo
    // In production, would query on-chain state
    
    // Get user's stake info from our DB (or we could query on-chain)
    const userResult = await query(`
      SELECT id, wallet_address, estimated_claimable_yield_sol
      FROM users
      WHERE wallet_address = $1
    `, [wallet]);
    
    // Get user's total claimed
    const claimedResult = await query(`
      SELECT COALESCE(SUM(amount_sol), 0) as total_claimed
      FROM yield_claims
      WHERE wallet_address = $1
    `, [wallet]);
    
    // Get total yield distributed to all stakers
    const totalYieldResult = await query(`
      SELECT COALESCE(SUM(staker_share_lamports), 0) / $1::numeric as total_yield_sol
      FROM yield_distributions
    `, [LAMPORTS_PER_SOL]);
    
    const estimatedClaimable = parseFloat(userResult.rows[0]?.estimated_claimable_yield_sol || 0);
    const totalClaimed = parseFloat(claimedResult.rows[0]?.total_claimed || 0);
    
    res.json({
      success: true,
      wallet,
      claimable: {
        estimatedSOL: estimatedClaimable,
        totalClaimedSOL: totalClaimed,
        totalYieldDistributedSOL: parseFloat(totalYieldResult.rows[0]?.total_yield_sol || 0),
      },
    });
  } catch (error) {
    console.error('Error fetching claimable yield:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch claimable yield' });
  }
});

// POST /api/yield/claim - Record a yield claim (after on-chain tx)
router.post('/claim', requireAuth, async (req, res) => {
  try {
    const { wallet_address, amount_lamports, tx_signature } = req.body;
    
    if (!wallet_address || !amount_lamports || !tx_signature) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: wallet_address, amount_lamports, tx_signature' 
      });
    }
    
    const amountSOL = amount_lamports / LAMPORTS_PER_SOL;
    
    // Record the claim
    const result = await query(`
      INSERT INTO yield_claims (user_id, wallet_address, amount_lamports, amount_sol, tx_signature)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [req.user?.id || null, wallet_address, amount_lamports, amountSOL, tx_signature]);
    
    // Update user's claimable (reset to 0 after claim)
    await query(`
      UPDATE users 
      SET estimated_claimable_yield_sol = 0, last_yield_calculation = NOW()
      WHERE wallet_address = $1
    `, [wallet_address]);
    
    res.json({
      success: true,
      claim: result.rows[0],
    });
  } catch (error) {
    console.error('Error recording claim:', error);
    res.status(500).json({ success: false, error: 'Failed to record claim' });
  }
});

// GET /api/yield/claims/:wallet - Get claim history for a wallet
router.get('/claims/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    
    const claims = await query(`
      SELECT 
        id,
        amount_sol,
        tx_signature,
        claimed_at
      FROM yield_claims
      WHERE wallet_address = $1
      ORDER BY claimed_at DESC
      LIMIT 50
    `, [wallet]);
    
    res.json({
      success: true,
      claims: claims.rows,
    });
  } catch (error) {
    console.error('Error fetching claims:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch claims' });
  }
});

// ==================== NEW REVENUE MODEL ENDPOINTS ====================

// GET /api/yield/revenue-model - Get revenue model configuration
router.get('/revenue-model', async (req, res) => {
  try {
    const model = getRevenueModelStats();
    res.json({
      success: true,
      model: {
        ...model,
        description: 'Primis takes 10% fee on compute volume. Revenue is split 50/50 with stakers.',
      },
    });
  } catch (error) {
    console.error('Error fetching revenue model:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch revenue model' });
  }
});

// GET /api/yield/apy/:stakeSOL - Calculate variable APY for a given stake amount
router.get('/apy/:stakeSOL', async (req, res) => {
  try {
    const stakeSOL = parseFloat(req.params.stakeSOL);
    
    if (isNaN(stakeSOL) || stakeSOL < 0) {
      return res.status(400).json({ success: false, error: 'Invalid stake amount' });
    }
    
    const apyDetails = await calculateUserAPY(stakeSOL);
    
    res.json({
      success: true,
      apy: apyDetails,
    });
  } catch (error) {
    console.error('Error calculating APY:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate APY' });
  }
});

// GET /api/yield/my-apy/:wallet - Calculate variable APY for a specific wallet's stake
router.get('/my-apy/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    
    // Get user's stake from the latest distribution data
    // In production, this would query the on-chain stake account
    // For now, we'll use the database
    const stakeResult = await query(`
      SELECT total_staked_lamports, staker_count 
      FROM yield_distributions 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    const totalStakedLamports = Number(stakeResult.rows[0]?.total_staked_lamports || 0);
    const totalStakedSOL = totalStakedLamports / LAMPORTS_PER_SOL;
    
    // For demo: if only 1 staker, assume they have all the stake
    // In production, this would query the actual stake account
    const stakerCount = stakeResult.rows[0]?.staker_count || 0;
    let userStakeSOL = 0;
    
    if (stakerCount === 1) {
      // Single staker gets all
      userStakeSOL = totalStakedSOL;
    } else {
      // For multiple stakers, we'd need to query the specific wallet
      // This is a simplification for demo
      userStakeSOL = totalStakedSOL / stakerCount;
    }
    
    const apyDetails = await calculateUserAPY(userStakeSOL, totalStakedSOL);
    
    res.json({
      success: true,
      wallet,
      apy: apyDetails,
    });
  } catch (error) {
    console.error('Error calculating user APY:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate user APY' });
  }
});

export default router;
