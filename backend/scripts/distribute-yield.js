#!/usr/bin/env node

/**
 * Primis Yield Distribution Service
 * 
 * This script distributes yield to stakers on the Primis protocol.
 * On devnet, it simulates yield by calculating based on APY.
 * 
 * Usage:
 *   node scripts/distribute-yield.js              # Run once
 *   node scripts/distribute-yield.js --dry-run    # Preview without executing
 *   node scripts/distribute-yield.js --cron       # Run in cron mode (every hour)
 */

import dotenv from 'dotenv';
import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import anchor from '@coral-xyz/anchor';
const { Program, AnchorProvider, BN } = anchor;
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend directory
const envPath = join(__dirname, '../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });
console.log('DATABASE_URL loaded:', process.env.DATABASE_URL ? 'Yes (' + process.env.DATABASE_URL.substring(0, 40) + '...)' : 'NO');

// ==================== CONFIG ====================

const PROGRAM_ID = new PublicKey('Bp4pmvckwNicvQrxafeCgrM35WnTE1qz2MbvGWA4GhDf');
const RPC_URL = 'https://api.devnet.solana.com';

// Yield parameters (annual rates, will calculate daily)
const BASE_STAKING_APY = 0.07;      // 7% base Solana staking APY
const COMPUTE_BONUS_APY = 0.05;     // 5% additional from compute revenue
const TOTAL_APY = BASE_STAKING_APY + COMPUTE_BONUS_APY;  // 12% total

// Protocol splits
const STAKER_SHARE_BPS = 7000;      // 70%
const SUBSIDY_SHARE_BPS = 2000;     // 20%
const RESERVE_SHARE_BPS = 1000;     // 10%
const BPS_DENOMINATOR = 10000;

// ==================== HELPERS ====================

function getVaultPDA() {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault')],
    PROGRAM_ID
  );
  return pda;
}

function getVaultSolPDA() {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_sol')],
    PROGRAM_ID
  );
  return pda;
}

function lamportsToSol(lamports) {
  return lamports / LAMPORTS_PER_SOL;
}

function solToLamports(sol) {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

// ==================== DATABASE ====================

async function getDbConnection() {
  // Try with SSL first (Supabase), fall back to no SSL (local)
  const connectionString = process.env.DATABASE_URL;
  
  // Check if it's a Supabase URL (contains .supabase.)
  const isSupabase = connectionString && connectionString.includes('.supabase.');
  
  const pool = new pg.Pool({
    connectionString,
    ssl: isSupabase ? { rejectUnauthorized: false } : false,
    statement_timeout: 300000,
    query_timeout: 300000
  });
  return pool;
}

async function recordDistribution(pool, data) {
  const result = await pool.query(`
    INSERT INTO yield_distributions (
      total_yield_lamports,
      staker_share_lamports,
      subsidy_share_lamports,
      reserve_share_lamports,
      total_staked_lamports,
      staker_count,
      source,
      tx_signature
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    data.totalYieldLamports,
    data.stakerShareLamports,
    data.subsidyShareLamports,
    data.reserveShareLamports,
    data.totalStakedLamports,
    data.stakerCount,
    data.source,
    data.txSignature
  ]);
  return result.rows[0];
}

async function updateUserClaimableYield(pool, walletAddress, additionalYieldSOL) {
  await pool.query(`
    UPDATE users 
    SET 
      estimated_claimable_yield_sol = COALESCE(estimated_claimable_yield_sol, 0) + $1,
      last_yield_calculation = NOW()
    WHERE wallet_address = $2
  `, [additionalYieldSOL, walletAddress]);
}

async function recordDailySnapshot(pool, data) {
  await pool.query(`
    INSERT INTO yield_snapshots (
      date,
      total_staked_sol,
      total_yield_distributed_sol,
      total_subsidy_pool_sol,
      total_reserve_sol,
      staker_count,
      daily_apy_percent
    ) VALUES (
      CURRENT_DATE,
      $1, $2, $3, $4, $5, $6
    )
    ON CONFLICT (date) DO UPDATE SET
      total_staked_sol = EXCLUDED.total_staked_sol,
      total_yield_distributed_sol = EXCLUDED.total_yield_distributed_sol,
      total_subsidy_pool_sol = EXCLUDED.total_subsidy_pool_sol,
      total_reserve_sol = EXCLUDED.total_reserve_sol,
      staker_count = EXCLUDED.staker_count,
      daily_apy_percent = EXCLUDED.daily_apy_percent,
      snapshot_at = NOW()
  `, [
    data.totalStakedSOL,
    data.totalYieldDistributedSOL,
    data.totalSubsidyPoolSOL,
    data.totalReserveSOL,
    data.stakerCount,
    data.dailyAPYPercent
  ]);
}

// ==================== SOLANA ====================

async function getVaultState(connection) {
  const vaultPDA = getVaultPDA();
  
  // Load IDL
  const idlPath = join(__dirname, '../../capital-provider-demo/src/primis_staking.json');
  const idl = JSON.parse(readFileSync(idlPath, 'utf8'));
  
  // Create dummy provider for reading
  const dummyProvider = new AnchorProvider(connection, {
    publicKey: PublicKey.default,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  }, { commitment: 'confirmed' });
  
  const program = new Program(idl, dummyProvider);
  
  try {
    const vault = await program.account.vault.fetch(vaultPDA);
    return {
      authority: vault.authority.toString(),
      totalStaked: vault.totalStaked.toNumber(),
      totalYieldDistributed: vault.totalYieldDistributed.toNumber(),
      totalSubsidyPool: vault.totalSubsidyPool.toNumber(),
      totalReserve: vault.totalReserve.toNumber(),
      stakerCount: vault.stakerCount,
      lastYieldDistribution: vault.lastYieldDistribution.toNumber(),
      isPaused: vault.isPaused,
    };
  } catch (error) {
    console.error('Failed to fetch vault state:', error.message);
    return null;
  }
}

async function distributeYieldOnChain(connection, authorityKeypair, totalYieldLamports) {
  const vaultPDA = getVaultPDA();
  
  // Load IDL
  const idlPath = join(__dirname, '../../capital-provider-demo/src/primis_staking.json');
  const idl = JSON.parse(readFileSync(idlPath, 'utf8'));
  
  // Create provider with authority
  const provider = new AnchorProvider(connection, {
    publicKey: authorityKeypair.publicKey,
    signTransaction: async (tx) => {
      tx.partialSign(authorityKeypair);
      return tx;
    },
    signAllTransactions: async (txs) => {
      txs.forEach(tx => tx.partialSign(authorityKeypair));
      return txs;
    },
  }, { commitment: 'confirmed' });
  
  const program = new Program(idl, provider);
  
  // Call distribute_yield instruction
  const tx = await program.methods
    .distributeYield(new BN(totalYieldLamports))
    .accounts({
      vault: vaultPDA,
      authority: authorityKeypair.publicKey,
    })
    .signers([authorityKeypair])
    .rpc();
  
  return tx;
}

async function fundVaultForYield(connection, funderKeypair, amountLamports) {
  const vaultSolPDA = getVaultSolPDA();
  
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: funderKeypair.publicKey,
      toPubkey: vaultSolPDA,
      lamports: amountLamports,
    })
  );
  
  const signature = await sendAndConfirmTransaction(connection, tx, [funderKeypair]);
  return signature;
}

// ==================== MAIN ====================

async function calculateDailyYield(totalStakedLamports) {
  // Calculate daily yield based on APY
  // Daily rate = APY / 365
  const dailyRate = TOTAL_APY / 365;
  const dailyYieldLamports = Math.floor(totalStakedLamports * dailyRate);
  
  return {
    dailyYieldLamports,
    dailyRate,
    annualAPY: TOTAL_APY,
    breakdown: {
      baseStaking: Math.floor(totalStakedLamports * (BASE_STAKING_APY / 365)),
      computeBonus: Math.floor(totalStakedLamports * (COMPUTE_BONUS_APY / 365)),
    }
  };
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isCron = args.includes('--cron');
  
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║     PRIMIS YIELD DISTRIBUTION SERVICE          ║');
  console.log('╠════════════════════════════════════════════════╣');
  console.log(`║  Mode: ${isDryRun ? 'DRY RUN (no transactions)' : isCron ? 'CRON MODE' : 'SINGLE RUN'}`.padEnd(49) + '║');
  console.log(`║  Network: Devnet`.padEnd(49) + '║');
  console.log('╚════════════════════════════════════════════════╝\n');
  
  // Connect to Solana
  const connection = new Connection(RPC_URL, 'confirmed');
  console.log('🔗 Connected to Solana devnet');
  
  // Get vault state
  const vaultState = await getVaultState(connection);
  if (!vaultState) {
    console.error('❌ Could not fetch vault state. Is the vault initialized?');
    process.exit(1);
  }
  
  console.log('\n📊 Current Vault State:');
  console.log(`   Total Staked:     ${lamportsToSol(vaultState.totalStaked).toFixed(4)} SOL`);
  console.log(`   Yield Distributed: ${lamportsToSol(vaultState.totalYieldDistributed).toFixed(4)} SOL`);
  console.log(`   Subsidy Pool:     ${lamportsToSol(vaultState.totalSubsidyPool).toFixed(4)} SOL`);
  console.log(`   Reserve:          ${lamportsToSol(vaultState.totalReserve).toFixed(4)} SOL`);
  console.log(`   Staker Count:     ${vaultState.stakerCount}`);
  
  if (vaultState.totalStaked === 0) {
    console.log('\n⚠️  No SOL staked. Nothing to distribute.');
    process.exit(0);
  }
  
  // Calculate yield
  const yieldCalc = await calculateDailyYield(vaultState.totalStaked);
  
  console.log('\n💰 Yield Calculation:');
  console.log(`   Daily Rate:       ${(yieldCalc.dailyRate * 100).toFixed(4)}%`);
  console.log(`   Annual APY:       ${(yieldCalc.annualAPY * 100).toFixed(2)}%`);
  console.log(`   Daily Yield:      ${lamportsToSol(yieldCalc.dailyYieldLamports).toFixed(6)} SOL`);
  console.log(`   - Base Staking:   ${lamportsToSol(yieldCalc.breakdown.baseStaking).toFixed(6)} SOL`);
  console.log(`   - Compute Bonus:  ${lamportsToSol(yieldCalc.breakdown.computeBonus).toFixed(6)} SOL`);
  
  // Calculate splits
  const stakerShareLamports = Math.floor(yieldCalc.dailyYieldLamports * STAKER_SHARE_BPS / BPS_DENOMINATOR);
  const subsidyShareLamports = Math.floor(yieldCalc.dailyYieldLamports * SUBSIDY_SHARE_BPS / BPS_DENOMINATOR);
  const reserveShareLamports = yieldCalc.dailyYieldLamports - stakerShareLamports - subsidyShareLamports;
  
  console.log('\n📤 Distribution Splits (70/20/10):');
  console.log(`   To Stakers (70%): ${lamportsToSol(stakerShareLamports).toFixed(6)} SOL`);
  console.log(`   To Subsidy (20%): ${lamportsToSol(subsidyShareLamports).toFixed(6)} SOL`);
  console.log(`   To Reserve (10%): ${lamportsToSol(reserveShareLamports).toFixed(6)} SOL`);
  
  if (isDryRun) {
    console.log('\n✅ Dry run complete. No transactions were made.');
    process.exit(0);
  }
  
  // Check for authority keypair
  const authorityKeyPath = process.env.AUTHORITY_KEYPAIR_PATH;
  if (!authorityKeyPath) {
    console.log('\n⚠️  No AUTHORITY_KEYPAIR_PATH set in .env');
    console.log('   To distribute yield on-chain, set AUTHORITY_KEYPAIR_PATH to your keypair file.');
    console.log('   Recording distribution in database only...\n');
  }
  
  // Connect to database
  const pool = await getDbConnection();
  console.log('🗄️  Connected to database');
  
  try {
    let txSignature = null;
    
    // If we have authority keypair, do on-chain distribution
    if (authorityKeyPath) {
      console.log('\n🔐 Loading authority keypair...');
      const keypairData = JSON.parse(readFileSync(authorityKeyPath, 'utf8'));
      const authorityKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
      
      console.log(`   Authority: ${authorityKeypair.publicKey.toString()}`);
      
      // Verify authority matches vault
      if (authorityKeypair.publicKey.toString() !== vaultState.authority) {
        console.error('❌ Authority keypair does not match vault authority!');
        console.error(`   Expected: ${vaultState.authority}`);
        console.error(`   Got:      ${authorityKeypair.publicKey.toString()}`);
        process.exit(1);
      }
      
      // Check authority balance (needs SOL for tx fees)
      const authorityBalance = await connection.getBalance(authorityKeypair.publicKey);
      console.log(`   Balance:   ${lamportsToSol(authorityBalance).toFixed(4)} SOL`);
      
      if (authorityBalance < 0.01 * LAMPORTS_PER_SOL) {
        console.error('❌ Authority needs at least 0.01 SOL for transaction fees');
        process.exit(1);
      }
      
      // First, fund the vault with the yield amount (devnet simulation)
      console.log('\n📥 Funding vault with yield (devnet simulation)...');
      const fundTx = await fundVaultForYield(connection, authorityKeypair, yieldCalc.dailyYieldLamports);
      console.log(`   Funded: ${fundTx}`);
      
      // Now distribute yield on-chain
      console.log('\n📤 Distributing yield on-chain...');
      txSignature = await distributeYieldOnChain(connection, authorityKeypair, yieldCalc.dailyYieldLamports);
      console.log(`   Transaction: ${txSignature}`);
      console.log(`   Solscan: https://solscan.io/tx/${txSignature}?cluster=devnet`);
    }
    
    // Record in database
    console.log('\n📝 Recording distribution in database...');
    const distribution = await recordDistribution(pool, {
      totalYieldLamports: yieldCalc.dailyYieldLamports,
      stakerShareLamports,
      subsidyShareLamports,
      reserveShareLamports,
      totalStakedLamports: vaultState.totalStaked,
      stakerCount: vaultState.stakerCount,
      source: 'simulated',
      txSignature,
    });
    console.log(`   Distribution ID: ${distribution.id}`);
    
    // Record daily snapshot
    console.log('📸 Recording daily snapshot...');
    await recordDailySnapshot(pool, {
      totalStakedSOL: lamportsToSol(vaultState.totalStaked),
      totalYieldDistributedSOL: lamportsToSol(vaultState.totalYieldDistributed + stakerShareLamports),
      totalSubsidyPoolSOL: lamportsToSol(vaultState.totalSubsidyPool + subsidyShareLamports),
      totalReserveSOL: lamportsToSol(vaultState.totalReserve + reserveShareLamports),
      stakerCount: vaultState.stakerCount,
      dailyAPYPercent: yieldCalc.dailyRate * 100,
    });
    
    console.log('\n✅ Yield distribution complete!');
    console.log(`   Total Distributed: ${lamportsToSol(yieldCalc.dailyYieldLamports).toFixed(6)} SOL`);
    
  } catch (error) {
    console.error('\n❌ Distribution failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run
main().catch(console.error);
