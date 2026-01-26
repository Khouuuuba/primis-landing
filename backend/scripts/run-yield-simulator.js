#!/usr/bin/env node
/**
 * Run Yield Simulator for Devnet Demo
 * 
 * Distributes simulated yield every 10 minutes (configurable)
 * so users can see yield accruing in real-time during testing.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from backend root
dotenv.config({ path: join(__dirname, '../.env') });

import { startScheduler, stopScheduler, getSchedulerStatus, triggerDistribution } from '../src/yield-scheduler.js';

// Configuration
const DEMO_SCHEDULE = process.env.YIELD_DISTRIBUTION_INTERVAL || '*/10 * * * *'; // Every 10 minutes
const RUN_IMMEDIATELY = process.argv.includes('--now');

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║       PRIMIS YIELD SIMULATOR (DEVNET DEMO)                ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

console.log('🔧 Configuration:');
console.log(`   Schedule: ${DEMO_SCHEDULE}`);
console.log(`   RPC: ${process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'}`);
console.log(`   Authority: ${process.env.AUTHORITY_KEYPAIR_PATH || 'Not configured (DB-only mode)'}\n`);

// Run immediately if requested
if (RUN_IMMEDIATELY) {
  console.log('⚡ Running immediate distribution...\n');
  triggerDistribution().then(result => {
    console.log('\n📊 Result:', result);
    console.log('\nStarting scheduler...\n');
    startScheduler(DEMO_SCHEDULE);
  });
} else {
  startScheduler(DEMO_SCHEDULE);
}

// Status endpoint (for monitoring)
let statusInterval = setInterval(() => {
  const status = getSchedulerStatus();
  if (status.lastRun) {
    console.log(`\n📈 Status: ${status.totalDistributions} distributions, ${status.totalYieldDistributed.toFixed(6)} SOL total`);
    console.log(`   Last: ${status.lastRun}`);
    console.log(`   Next: ${status.nextRun}`);
    if (status.lastResult?.error) {
      console.log(`   ⚠️ Last error: ${status.lastResult.error}`);
    }
  }
}, 5 * 60 * 1000); // Log status every 5 minutes

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down yield simulator...');
  clearInterval(statusInterval);
  stopScheduler();
  
  const status = getSchedulerStatus();
  console.log('\n📊 Final Stats:');
  console.log(`   Total distributions: ${status.totalDistributions}`);
  console.log(`   Total yield distributed: ${status.totalYieldDistributed.toFixed(6)} SOL`);
  console.log(`   Last run: ${status.lastRun}`);
  
  process.exit(0);
});

console.log('Press Ctrl+C to stop\n');
