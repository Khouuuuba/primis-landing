#!/usr/bin/env node
/**
 * Setup Yield Simulator for Devnet Testing
 * 
 * This script:
 * 1. Generates or loads an authority keypair
 * 2. Requests devnet SOL from faucet
 * 3. Verifies vault state
 * 4. Outputs configuration instructions
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RPC_URL = 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('Bp4pmvckwNicvQrxafeCgrM35WnTE1qz2MbvGWA4GhDf');
const KEYPAIR_DIR = join(__dirname, '../.keys');
const KEYPAIR_PATH = join(KEYPAIR_DIR, 'yield-authority.json');

function getVaultPDA() {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('vault')], PROGRAM_ID);
  return pda;
}

function getVaultSolPDA() {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('vault_sol')], PROGRAM_ID);
  return pda;
}

async function requestAirdrop(connection, publicKey, amount = 2) {
  console.log(`\n💧 Requesting ${amount} SOL airdrop...`);
  try {
    const signature = await connection.requestAirdrop(
      publicKey,
      amount * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(signature, 'confirmed');
    console.log(`   ✅ Airdrop successful: ${signature}`);
    return true;
  } catch (error) {
    if (error.message.includes('429')) {
      console.log('   ⚠️ Rate limited. Try again in a few minutes or use https://faucet.solana.com');
    } else {
      console.log(`   ❌ Airdrop failed: ${error.message}`);
    }
    return false;
  }
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║       PRIMIS YIELD SIMULATOR SETUP (DEVNET)               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const connection = new Connection(RPC_URL, 'confirmed');

  // Step 1: Load or generate keypair
  console.log('📁 Step 1: Authority Keypair');
  let keypair;
  
  if (existsSync(KEYPAIR_PATH)) {
    console.log('   Found existing keypair');
    const keypairData = JSON.parse(readFileSync(KEYPAIR_PATH, 'utf8'));
    keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  } else {
    console.log('   Generating new keypair...');
    if (!existsSync(KEYPAIR_DIR)) {
      mkdirSync(KEYPAIR_DIR, { recursive: true });
    }
    keypair = Keypair.generate();
    writeFileSync(KEYPAIR_PATH, JSON.stringify(Array.from(keypair.secretKey)));
    console.log('   ✅ New keypair saved');
  }
  
  console.log(`   Address: ${keypair.publicKey.toString()}`);

  // Step 2: Check balance
  console.log('\n💰 Step 2: Check Balance');
  let balance = await connection.getBalance(keypair.publicKey);
  console.log(`   Current balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  // Step 3: Request airdrop if needed
  if (balance < 1 * LAMPORTS_PER_SOL) {
    console.log('\n💧 Step 3: Request Devnet SOL');
    await requestAirdrop(connection, keypair.publicKey, 2);
    balance = await connection.getBalance(keypair.publicKey);
    console.log(`   Updated balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  } else {
    console.log('\n✅ Step 3: Sufficient balance, skipping airdrop');
  }

  // Step 4: Check vault state
  console.log('\n🏦 Step 4: Check Vault State');
  const vaultPDA = getVaultPDA();
  const vaultSolPDA = getVaultSolPDA();
  
  console.log(`   Vault PDA: ${vaultPDA.toString()}`);
  console.log(`   Vault SOL PDA: ${vaultSolPDA.toString()}`);
  
  const vaultInfo = await connection.getAccountInfo(vaultPDA);
  if (vaultInfo) {
    console.log('   ✅ Vault is initialized');
    
    const vaultSolBalance = await connection.getBalance(vaultSolPDA);
    console.log(`   Vault SOL balance: ${vaultSolBalance / LAMPORTS_PER_SOL} SOL`);
  } else {
    console.log('   ⚠️ Vault not initialized. Initialize it first via the Capital Allocator demo.');
  }

  // Step 5: Output configuration
  console.log('\n📋 Step 5: Configuration');
  console.log('─'.repeat(60));
  console.log('\nAdd these to your backend .env file:\n');
  console.log(`AUTHORITY_KEYPAIR_PATH=${KEYPAIR_PATH}`);
  console.log(`SOLANA_RPC_URL=${RPC_URL}`);
  console.log(`YIELD_DISTRIBUTION_INTERVAL=*/10 * * * *   # Every 10 minutes for demo`);
  console.log('─'.repeat(60));

  // Step 6: Summary
  console.log('\n📊 Setup Summary');
  console.log('─'.repeat(60));
  console.log(`Authority Address:  ${keypair.publicKey.toString()}`);
  console.log(`Authority Balance:  ${balance / LAMPORTS_PER_SOL} SOL`);
  console.log(`Keypair Location:   ${KEYPAIR_PATH}`);
  console.log(`Vault Initialized:  ${vaultInfo ? 'Yes' : 'No'}`);
  console.log('─'.repeat(60));

  // Instructions
  console.log('\n🚀 Next Steps');
  console.log('─'.repeat(60));
  console.log('1. Copy the env vars above to backend/.env');
  console.log('2. If vault not initialized, deposit SOL via Capital Allocator demo');
  console.log('3. Run: npm run yield-simulator');
  console.log('4. Watch yield distributions every 10 minutes!');
  console.log('─'.repeat(60));

  // If authority doesn't match vault authority, warn
  if (vaultInfo) {
    // We'd need to decode the vault account to check authority
    // For now, just note that it should be verified
    console.log('\n⚠️  Important: Make sure this authority keypair matches the vault authority!');
    console.log('   If not, you need to initialize a new vault with this keypair as authority.');
  }

  console.log('\n✨ Setup complete!\n');
}

main().catch(console.error);
