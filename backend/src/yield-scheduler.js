/**
 * Yield Distribution Scheduler
 * 
 * Automatically distributes yield to stakers on a schedule.
 * Default: Every 24 hours at midnight UTC
 * 
 * For testing: Can be configured to run more frequently
 */

import cron from 'node-cron';
import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import anchor from '@coral-xyz/anchor';
const { Program, AnchorProvider, BN } = anchor;
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { query } from './db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ==================== CONFIG ====================

const PROGRAM_ID = new PublicKey('Bp4pmvckwNicvQrxafeCgrM35WnTE1qz2MbvGWA4GhDf');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const LAMPORTS = LAMPORTS_PER_SOL;

// Yield parameters
const TOTAL_APY = 0.12; // 12% annual
const STAKER_SHARE_BPS = 7000;
const SUBSIDY_SHARE_BPS = 2000;
const RESERVE_SHARE_BPS = 1000;
const BPS_DENOMINATOR = 10000;

// Scheduler state
let schedulerState = {
  isRunning: false,
  lastRun: null,
  lastResult: null,
  nextRun: null,
  totalDistributions: 0,
  totalYieldDistributed: 0,
  errors: [],
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

async function getVaultState() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const vaultPDA = getVaultPDA();
  
  const idlPath = join(__dirname, '../../capital-provider-demo/src/primis_staking.json');
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
  console.log(`\n[${new Date().toISOString()}] 🔄 Starting scheduled yield distribution...`);
  
  try {
    // Get vault state
    const vault = await getVaultState();
    console.log(`   Vault: ${vault.totalStaked / LAMPORTS} SOL staked, ${vault.stakerCount} stakers`);
    
    if (vault.totalStaked === 0) {
      console.log('   ⚠️ No SOL staked, skipping distribution');
      return { success: true, skipped: true, reason: 'No stake' };
    }
    
    // Calculate daily yield
    const dailyRate = TOTAL_APY / 365;
    const dailyYieldLamports = Math.floor(vault.totalStaked * dailyRate);
    const stakerShareLamports = Math.floor(dailyYieldLamports * STAKER_SHARE_BPS / BPS_DENOMINATOR);
    const subsidyShareLamports = Math.floor(dailyYieldLamports * SUBSIDY_SHARE_BPS / BPS_DENOMINATOR);
    const reserveShareLamports = dailyYieldLamports - stakerShareLamports - subsidyShareLamports;
    
    console.log(`   Daily yield: ${dailyYieldLamports / LAMPORTS} SOL`);
    
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
      
      // Fund vault with yield
      const vaultSolPDA = getVaultSolPDA();
      const fundTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: authorityKeypair.publicKey,
          toPubkey: vaultSolPDA,
          lamports: dailyYieldLamports,
        })
      );
      await sendAndConfirmTransaction(connection, fundTx, [authorityKeypair]);
      console.log('   ✅ Vault funded');
      
      // Distribute on-chain
      const idlPath = join(__dirname, '../../capital-provider-demo/src/primis_staking.json');
      const idl = JSON.parse(readFileSync(idlPath, 'utf8'));
      const provider = new AnchorProvider(connection, {
        publicKey: authorityKeypair.publicKey,
        signTransaction: async (tx) => { tx.partialSign(authorityKeypair); return tx; },
        signAllTransactions: async (txs) => { txs.forEach(tx => tx.partialSign(authorityKeypair)); return txs; },
      }, { commitment: 'confirmed' });
      
      const program = new Program(idl, provider);
      txSignature = await program.methods
        .distributeYield(new BN(dailyYieldLamports))
        .accounts({ vault: getVaultPDA(), authority: authorityKeypair.publicKey })
        .signers([authorityKeypair])
        .rpc();
      
      console.log(`   ✅ On-chain distribution: ${txSignature}`);
    } else {
      console.log('   ⚠️ No authority keypair, database-only recording');
    }
    
    // Record in database
    await query(`
      INSERT INTO yield_distributions (
        total_yield_lamports, staker_share_lamports, subsidy_share_lamports,
        reserve_share_lamports, total_staked_lamports, staker_count, source, tx_signature
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [dailyYieldLamports, stakerShareLamports, subsidyShareLamports, 
        reserveShareLamports, vault.totalStaked, vault.stakerCount, 
        'automated', txSignature]);
    
    // Record snapshot
    await query(`
      INSERT INTO yield_snapshots (date, total_staked_sol, total_yield_distributed_sol, 
        total_subsidy_pool_sol, total_reserve_sol, staker_count, daily_apy_percent)
      VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6)
      ON CONFLICT (date) DO UPDATE SET
        total_staked_sol = EXCLUDED.total_staked_sol,
        total_yield_distributed_sol = yield_snapshots.total_yield_distributed_sol + EXCLUDED.total_yield_distributed_sol,
        snapshot_at = NOW()
    `, [vault.totalStaked / LAMPORTS, stakerShareLamports / LAMPORTS, 
        subsidyShareLamports / LAMPORTS, reserveShareLamports / LAMPORTS, 
        vault.stakerCount, dailyRate * 100]);
    
    const duration = Date.now() - startTime;
    console.log(`   ✅ Distribution complete in ${duration}ms`);
    
    // Update state
    schedulerState.totalDistributions++;
    schedulerState.totalYieldDistributed += dailyYieldLamports / LAMPORTS;
    schedulerState.lastResult = {
      success: true,
      yieldSOL: dailyYieldLamports / LAMPORTS,
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
};
