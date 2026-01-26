/**
 * Yield Distribution Scheduler
 * 
 * Automatically distributes yield to stakers on a schedule.
 * Default: Every 24 hours at midnight UTC
 * 
 * For testing: Can be configured to run more frequently
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env first!
dotenv.config({ path: join(__dirname, '../.env') });

import cron from 'node-cron';
import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import anchor from '@coral-xyz/anchor';
const { Program, AnchorProvider, BN } = anchor;
import { readFileSync, existsSync } from 'fs';
import { query } from './db/connection.js';

// ==================== CONFIG ====================

const PROGRAM_ID = new PublicKey('Bp4pmvckwNicvQrxafeCgrM35WnTE1qz2MbvGWA4GhDf');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const LAMPORTS = LAMPORTS_PER_SOL;

// ==================== NEW REVENUE MODEL ====================
// Primis takes 10% fee on compute volume
// Revenue is split 50/50 between Primis and stakers
// APY is variable based on: (Staker Pool / TVL)

const SIMULATED_YEARLY_COMPUTE_VOLUME_USD = 10_000_000; // $10M yearly
const PRIMIS_FEE_PERCENT = 0.10; // 10% fee on compute
const STAKER_SHARE_PERCENT = 0.50; // 50% of revenue to stakers
const PRIMIS_SHARE_PERCENT = 0.50; // 50% of revenue to Primis

// Calculated values
const YEARLY_REVENUE_USD = SIMULATED_YEARLY_COMPUTE_VOLUME_USD * PRIMIS_FEE_PERCENT; // $1M
const YEARLY_STAKER_POOL_USD = YEARLY_REVENUE_USD * STAKER_SHARE_PERCENT; // $500K
const INTERVALS_PER_YEAR = 365 * 24 * 6; // 52,560 (every 10 minutes)
const PER_INTERVAL_STAKER_POOL_USD = YEARLY_STAKER_POOL_USD / INTERVALS_PER_YEAR; // ~$9.51

// SOL price for conversion (can be made dynamic later)
const SOL_PRICE_USD = 150;

// Scheduler state
let schedulerState = {
  isRunning: false,
  lastRun: null,
  lastResult: null,
  nextRun: null,
  totalDistributions: 0,
  totalYieldDistributed: 0,
  errors: [],
  // New revenue model stats
  revenueModel: {
    yearlyComputeVolumeUSD: SIMULATED_YEARLY_COMPUTE_VOLUME_USD,
    yearlyRevenueUSD: YEARLY_REVENUE_USD,
    yearlyStakerPoolUSD: YEARLY_STAKER_POOL_USD,
    primisFeePercent: PRIMIS_FEE_PERCENT * 100,
    stakerSharePercent: STAKER_SHARE_PERCENT * 100,
    primisSharePercent: PRIMIS_SHARE_PERCENT * 100,
    solPriceUSD: SOL_PRICE_USD,
  },
};

// ==================== HELPERS ====================

function getVaultPDA() {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('vault')], PROGRAM_ID);
  return pda;
}

function getVaultSolPDA() {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('vault_sol')], PROGRAM_ID);
  return pda;
}

// ==================== CORE FUNCTIONS ====================

/**
 * Get current on-chain vault state
 * @returns {Promise<{authority: string, totalStaked: number, totalYieldDistributed: number, stakerCount: number}>}
 */
export async function getVaultState() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const vaultPDA = getVaultPDA();
  
  const idlPath = join(__dirname, 'primis_staking.json');
  if (!existsSync(idlPath)) {
    throw new Error('IDL file not found: ' + idlPath);
  }
  
  const idl = JSON.parse(readFileSync(idlPath, 'utf8'));
  const dummyProvider = new AnchorProvider(connection, {
    publicKey: PublicKey.default,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  }, { commitment: 'confirmed' });
  
  const program = new Program(idl, dummyProvider);
  const vault = await program.account.vault.fetch(vaultPDA);
  
  return {
    authority: vault.authority.toString(),
    totalStaked: vault.totalStaked.toNumber(),
    totalYieldDistributed: vault.totalYieldDistributed.toNumber(),
    stakerCount: vault.stakerCount,
  };
}

async function distributeYield() {
  const startTime = Date.now();
  console.log(`\n[${new Date().toISOString()}] 🔄 Starting yield distribution (New Revenue Model)...`);
  
  try {
    // Get vault state
    const vault = await getVaultState();
    const tvlSOL = vault.totalStaked / LAMPORTS;
    const tvlUSD = tvlSOL * SOL_PRICE_USD;
    
    console.log(`   Vault: ${tvlSOL.toFixed(2)} SOL staked (~$${tvlUSD.toFixed(0)}), ${vault.stakerCount} stakers`);
    
    if (vault.totalStaked === 0) {
      console.log('   ⚠️ No SOL staked, skipping distribution');
      return { success: true, skipped: true, reason: 'No stake' };
    }
    
    // ==================== NEW REVENUE MODEL CALCULATION ====================
    // Compute volume simulation (per interval)
    const computeVolumeUSD = SIMULATED_YEARLY_COMPUTE_VOLUME_USD / INTERVALS_PER_YEAR;
    const revenueUSD = computeVolumeUSD * PRIMIS_FEE_PERCENT;
    const stakerPoolUSD = revenueUSD * STAKER_SHARE_PERCENT;
    const primisShareUSD = revenueUSD * PRIMIS_SHARE_PERCENT;
    
    // Convert to SOL
    const stakerShareSOL = stakerPoolUSD / SOL_PRICE_USD;
    const stakerShareLamports = Math.floor(stakerShareSOL * LAMPORTS);
    const primisShareLamports = Math.floor((primisShareUSD / SOL_PRICE_USD) * LAMPORTS);
    const totalYieldLamports = stakerShareLamports + primisShareLamports;
    
    // Calculate effective APY for display
    const yearlyStakerPoolSOL = YEARLY_STAKER_POOL_USD / SOL_PRICE_USD;
    const effectiveAPY = (yearlyStakerPoolSOL / tvlSOL) * 100;
    
    console.log(`   📊 Revenue Model:`);
    console.log(`      Compute volume: $${computeVolumeUSD.toFixed(2)} (this interval)`);
    console.log(`      Primis fee (10%): $${revenueUSD.toFixed(2)}`);
    console.log(`      Staker pool (50%): $${stakerPoolUSD.toFixed(2)} = ${stakerShareSOL.toFixed(6)} SOL`);
    console.log(`      Primis share (50%): $${primisShareUSD.toFixed(2)}`);
    console.log(`      Effective APY: ${effectiveAPY.toFixed(2)}% (based on current TVL)`);
    
    // For database compatibility, use old field names
    const subsidyShareLamports = 0; // No longer used in new model
    const reserveShareLamports = primisShareLamports; // Primis share goes to reserve
    
    // Check for authority keypair
    const keypairPath = process.env.AUTHORITY_KEYPAIR_PATH;
    let txSignature = null;
    
    if (keypairPath && existsSync(keypairPath)) {
      const connection = new Connection(RPC_URL, 'confirmed');
      const keypairData = JSON.parse(readFileSync(keypairPath, 'utf8'));
      const authorityKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
      
      // Verify authority
      if (authorityKeypair.publicKey.toString() !== vault.authority) {
        throw new Error('Authority keypair does not match vault authority');
      }
      
      // Fund vault with staker share (the amount that goes to stakers)
      const vaultSolPDA = getVaultSolPDA();
      const fundTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: authorityKeypair.publicKey,
          toPubkey: vaultSolPDA,
          lamports: stakerShareLamports,
        })
      );
      await sendAndConfirmTransaction(connection, fundTx, [authorityKeypair]);
      console.log('   ✅ Vault funded with staker share');
      
      // Distribute on-chain
      const idlPath = join(__dirname, 'primis_staking.json');
      const idl = JSON.parse(readFileSync(idlPath, 'utf8'));
      const provider = new AnchorProvider(connection, {
        publicKey: authorityKeypair.publicKey,
        signTransaction: async (tx) => { tx.partialSign(authorityKeypair); return tx; },
        signAllTransactions: async (txs) => { txs.forEach(tx => tx.partialSign(authorityKeypair)); return txs; },
      }, { commitment: 'confirmed' });
      
      const program = new Program(idl, provider);
      txSignature = await program.methods
        .distributeYield(new BN(stakerShareLamports))
        .accounts({ vault: getVaultPDA(), authority: authorityKeypair.publicKey })
        .signers([authorityKeypair])
        .rpc();
      
      console.log(`   ✅ On-chain distribution: ${txSignature}`);
    } else {
      console.log('   ⚠️ No authority keypair, database-only recording');
    }
    
    // Record in database (using existing schema, mapping new model to old fields)
    // staker_share = 50% to stakers
    // subsidy_share = 0 (no longer used)
    // reserve_share = 50% to Primis
    await query(`
      INSERT INTO yield_distributions (
        total_yield_lamports, staker_share_lamports, subsidy_share_lamports,
        reserve_share_lamports, total_staked_lamports, staker_count, source, tx_signature
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [totalYieldLamports, stakerShareLamports, subsidyShareLamports, 
        reserveShareLamports, vault.totalStaked, vault.stakerCount, 
        'automated', txSignature]);
    
    // Record compute volume for tracking
    await query(`
      INSERT INTO yield_snapshots (date, total_staked_sol, total_yield_distributed_sol, 
        total_subsidy_pool_sol, total_reserve_sol, staker_count, daily_apy_percent)
      VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6)
      ON CONFLICT (date) DO UPDATE SET
        total_staked_sol = EXCLUDED.total_staked_sol,
        total_yield_distributed_sol = yield_snapshots.total_yield_distributed_sol + EXCLUDED.total_yield_distributed_sol,
        snapshot_at = NOW()
    `, [tvlSOL, stakerShareLamports / LAMPORTS, 
        0, primisShareLamports / LAMPORTS, 
        vault.stakerCount, effectiveAPY]);
    
    const duration = Date.now() - startTime;
    console.log(`   ✅ Distribution complete in ${duration}ms`);
    
    // Update state
    schedulerState.totalDistributions++;
    schedulerState.totalYieldDistributed += stakerShareLamports / LAMPORTS;
    schedulerState.lastResult = {
      success: true,
      stakerShareSOL: stakerShareLamports / LAMPORTS,
      primisShareSOL: primisShareLamports / LAMPORTS,
      computeVolumeUSD: computeVolumeUSD,
      effectiveAPY: effectiveAPY,
      txSignature,
      duration,
    };
    
    return schedulerState.lastResult;
    
  } catch (error) {
    console.error(`   ❌ Distribution failed:`, error.message);
    schedulerState.errors.push({
      time: new Date().toISOString(),
      error: error.message,
    });
    // Keep only last 10 errors
    if (schedulerState.errors.length > 10) {
      schedulerState.errors = schedulerState.errors.slice(-10);
    }
    schedulerState.lastResult = { success: false, error: error.message };
    return schedulerState.lastResult;
  } finally {
    schedulerState.lastRun = new Date().toISOString();
  }
}

// ==================== SCHEDULER ====================

let cronJob = null;

/**
 * Start the yield distribution scheduler
 * @param {string} schedule - Cron expression (default: '0 0 * * *' = midnight daily)
 */
export function startScheduler(schedule = '0 0 * * *') {
  if (cronJob) {
    console.log('⚠️ Scheduler already running');
    return;
  }
  
  // Validate cron expression
  if (!cron.validate(schedule)) {
    console.error('❌ Invalid cron expression:', schedule);
    return;
  }
  
  cronJob = cron.schedule(schedule, async () => {
    await distributeYield();
  }, {
    timezone: 'UTC'
  });
  
  schedulerState.isRunning = true;
  schedulerState.nextRun = getNextRunTime(schedule);
  
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║     YIELD SCHEDULER STARTED                    ║`);
  console.log(`╠════════════════════════════════════════════════╣`);
  console.log(`║  Schedule: ${schedule.padEnd(35)}║`);
  console.log(`║  Next run: ${schedulerState.nextRun.padEnd(35)}║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);
}

/**
 * Stop the scheduler
 */
export function stopScheduler() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    schedulerState.isRunning = false;
    schedulerState.nextRun = null;
    console.log('🛑 Yield scheduler stopped');
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  return {
    ...schedulerState,
    uptime: schedulerState.isRunning ? 'Running' : 'Stopped',
  };
}

/**
 * Manually trigger a distribution (for testing)
 */
export async function triggerDistribution() {
  return await distributeYield();
}

/**
 * Calculate variable APY for a user based on their stake
 * @param {number} userStakeSOL - User's stake in SOL
 * @param {number} totalStakedSOL - Total TVL in SOL (optional, fetched if not provided)
 * @returns {object} APY details
 */
export async function calculateUserAPY(userStakeSOL, totalStakedSOL = null) {
  try {
    // Get TVL if not provided
    if (totalStakedSOL === null) {
      const vault = await getVaultState();
      totalStakedSOL = vault.totalStaked / LAMPORTS;
    }
    
    if (totalStakedSOL === 0 || userStakeSOL === 0) {
      return {
        userStakeSOL,
        totalStakedSOL,
        stakePercent: 0,
        yearlyEarningsUSD: 0,
        yearlyEarningsSOL: 0,
        effectiveAPY: 0,
        revenueModel: schedulerState.revenueModel,
      };
    }
    
    // Calculate user's share of the pool
    const stakePercent = (userStakeSOL / totalStakedSOL) * 100;
    const userShareOfPool = userStakeSOL / totalStakedSOL;
    
    // Calculate yearly earnings
    const yearlyEarningsUSD = YEARLY_STAKER_POOL_USD * userShareOfPool;
    const yearlyEarningsSOL = yearlyEarningsUSD / SOL_PRICE_USD;
    
    // Calculate effective APY
    const userStakeValueUSD = userStakeSOL * SOL_PRICE_USD;
    const effectiveAPY = (yearlyEarningsUSD / userStakeValueUSD) * 100;
    
    return {
      userStakeSOL,
      totalStakedSOL,
      stakePercent: stakePercent.toFixed(2),
      yearlyEarningsUSD: yearlyEarningsUSD.toFixed(2),
      yearlyEarningsSOL: yearlyEarningsSOL.toFixed(4),
      effectiveAPY: effectiveAPY.toFixed(2),
      revenueModel: schedulerState.revenueModel,
    };
  } catch (error) {
    console.error('Error calculating user APY:', error);
    throw error;
  }
}

/**
 * Get current revenue model stats
 */
export function getRevenueModelStats() {
  return {
    ...schedulerState.revenueModel,
    yearlyStakerPoolSOL: YEARLY_STAKER_POOL_USD / SOL_PRICE_USD,
    perIntervalStakerPoolUSD: PER_INTERVAL_STAKER_POOL_USD,
    perIntervalStakerPoolSOL: PER_INTERVAL_STAKER_POOL_USD / SOL_PRICE_USD,
    intervalsPerYear: INTERVALS_PER_YEAR,
  };
}

/**
 * Calculate next run time from cron expression
 */
function getNextRunTime(cronExpression) {
  // Simple calculation for common patterns
  const now = new Date();
  const parts = cronExpression.split(' ');
  
  if (cronExpression === '0 0 * * *') {
    // Daily at midnight
    const next = new Date(now);
    next.setUTCHours(0, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }
  
  if (cronExpression === '0 * * * *') {
    // Every hour
    const next = new Date(now);
    next.setMinutes(0, 0, 0);
    if (next <= now) next.setHours(next.getHours() + 1);
    return next.toISOString();
  }
  
  if (cronExpression === '*/5 * * * *') {
    // Every 5 minutes
    const next = new Date(now);
    const mins = Math.ceil(next.getMinutes() / 5) * 5;
    next.setMinutes(mins, 0, 0);
    if (next <= now) next.setMinutes(next.getMinutes() + 5);
    return next.toISOString();
  }
  
  return 'See cron expression: ' + cronExpression;
}

export default {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  triggerDistribution,
  calculateUserAPY,
  getRevenueModelStats,
  getVaultState,
};
