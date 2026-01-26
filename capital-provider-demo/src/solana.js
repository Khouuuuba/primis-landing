import { Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import idl from './primis_staking.json';

// Program ID from deployment
export const PROGRAM_ID = new PublicKey('Bp4pmvckwNicvQrxafeCgrM35WnTE1qz2MbvGWA4GhDf');

// Devnet connection
export const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Constants
export const MINIMUM_STAKE = 1; // 1 SOL minimum for devnet beta
export const LAMPORTS = LAMPORTS_PER_SOL;

// PDA derivation functions
export function getVaultPDA() {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault')],
    PROGRAM_ID
  );
  return pda;
}

export function getVaultSolPDA() {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_sol')],
    PROGRAM_ID
  );
  return pda;
}

export function getStakeAccountPDA(walletPubkey) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('stake'), walletPubkey.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

// Create Anchor provider from wallet
export function createProvider(wallet) {
  // Create a wallet adapter wrapper
  const walletAdapter = {
    publicKey: wallet.publicKey,
    signTransaction: async (tx) => {
      return await wallet.signTransaction(tx);
    },
    signAllTransactions: async (txs) => {
      return await wallet.signAllTransactions(txs);
    },
  };
  
  return new AnchorProvider(connection, walletAdapter, {
    commitment: 'confirmed',
  });
}

// Create program instance
export function createProgram(provider) {
  return new Program(idl, provider);
}

// ========== READ FUNCTIONS ==========

// Fetch vault state
export async function getVaultState() {
  try {
    const vaultPDA = getVaultPDA();
    const accountInfo = await connection.getAccountInfo(vaultPDA);
    
    if (!accountInfo) {
      return null; // Vault not initialized
    }
    
    // Create a dummy provider just for reading
    const dummyProvider = new AnchorProvider(connection, {
      publicKey: PublicKey.default,
      signTransaction: async () => {},
      signAllTransactions: async () => {},
    }, { commitment: 'confirmed' });
    
    const program = createProgram(dummyProvider);
    const vault = await program.account.vault.fetch(vaultPDA);
    
    return {
      authority: vault.authority.toString(),
      totalStaked: vault.totalStaked.toNumber() / LAMPORTS,
      totalYieldDistributed: vault.totalYieldDistributed.toNumber() / LAMPORTS,
      totalSubsidyPool: vault.totalSubsidyPool.toNumber() / LAMPORTS,
      totalReserve: vault.totalReserve.toNumber() / LAMPORTS,
      stakerCount: vault.stakerCount,
      isPaused: vault.isPaused,
    };
  } catch (error) {
    console.error('Error fetching vault state:', error);
    return null;
  }
}

// Fetch user's stake account
export async function getStakeAccount(walletPubkey) {
  try {
    const stakeAccountPDA = getStakeAccountPDA(walletPubkey);
    const accountInfo = await connection.getAccountInfo(stakeAccountPDA);
    
    if (!accountInfo) {
      return null; // No stake account
    }
    
    const dummyProvider = new AnchorProvider(connection, {
      publicKey: PublicKey.default,
      signTransaction: async () => {},
      signAllTransactions: async () => {},
    }, { commitment: 'confirmed' });
    
    const program = createProgram(dummyProvider);
    const stakeAccount = await program.account.stakeAccount.fetch(stakeAccountPDA);
    
    return {
      staker: stakeAccount.staker.toString(),
      amount: stakeAccount.amount.toNumber() / LAMPORTS,
      depositedAt: stakeAccount.depositedAt.toNumber(),
      lastYieldClaim: stakeAccount.lastYieldClaim.toNumber(),
      totalYieldClaimed: stakeAccount.totalYieldClaimed.toNumber() / LAMPORTS,
    };
  } catch (error) {
    console.error('Error fetching stake account:', error);
    return null;
  }
}

// Get wallet SOL balance
export async function getWalletBalance(walletPubkey) {
  try {
    const balance = await connection.getBalance(walletPubkey);
    return balance / LAMPORTS;
  } catch (error) {
    console.error('Error fetching balance:', error);
    return 0;
  }
}

// ========== WRITE FUNCTIONS ==========

// Initialize vault (admin only, one-time)
export async function initializeVault(wallet) {
  const provider = createProvider(wallet);
  const program = createProgram(provider);
  
  const vaultPDA = getVaultPDA();
  const vaultSolPDA = getVaultSolPDA();
  
  const tx = await program.methods
    .initialize(wallet.publicKey)
    .accounts({
      vault: vaultPDA,
      vaultSol: vaultSolPDA,
      payer: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  
  return tx;
}

// Deposit SOL
export async function depositSOL(wallet, amountSOL) {
  const provider = createProvider(wallet);
  const program = createProgram(provider);
  
  const vaultPDA = getVaultPDA();
  const vaultSolPDA = getVaultSolPDA();
  const stakeAccountPDA = getStakeAccountPDA(wallet.publicKey);
  
  const amountLamports = new BN(amountSOL * LAMPORTS);
  
  const tx = await program.methods
    .deposit(amountLamports)
    .accounts({
      vault: vaultPDA,
      vaultSol: vaultSolPDA,
      stakeAccount: stakeAccountPDA,
      staker: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  
  return tx;
}

// Withdraw SOL
export async function withdrawSOL(wallet, amountSOL) {
  const provider = createProvider(wallet);
  const program = createProgram(provider);
  
  const vaultPDA = getVaultPDA();
  const vaultSolPDA = getVaultSolPDA();
  const stakeAccountPDA = getStakeAccountPDA(wallet.publicKey);
  
  const amountLamports = new BN(amountSOL * LAMPORTS);
  
  const tx = await program.methods
    .withdraw(amountLamports)
    .accounts({
      vault: vaultPDA,
      vaultSol: vaultSolPDA,
      stakeAccount: stakeAccountPDA,
      staker: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  
  return tx;
}

// Claim yield
export async function claimYield(wallet) {
  const provider = createProvider(wallet);
  const program = createProgram(provider);
  
  const vaultPDA = getVaultPDA();
  const vaultSolPDA = getVaultSolPDA();
  const stakeAccountPDA = getStakeAccountPDA(wallet.publicKey);
  
  const tx = await program.methods
    .claimYield()
    .accounts({
      vault: vaultPDA,
      vaultSol: vaultSolPDA,
      stakeAccount: stakeAccountPDA,
      staker: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  
  return tx;
}

// Get Solscan link for transaction
export function getSolscanLink(signature) {
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

// Get Solscan link for account
export function getSolscanAccountLink(address) {
  return `https://solscan.io/account/${address}?cluster=devnet`;
}
