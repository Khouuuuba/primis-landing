const anchor = require("@coral-xyz/anchor");
const { SystemProgram, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const assert = require("assert");

describe("primis-staking", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PrimisStaking;
  
  // PDAs
  let vaultPda;
  let vaultSolPda;
  let stakeAccountPda;
  
  // Constants matching the program
  const MINIMUM_STAKE = 10 * LAMPORTS_PER_SOL; // 10 SOL

  before(async () => {
    // Find PDAs
    [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    );
    
    [vaultSolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_sol")],
      program.programId
    );
    
    [stakeAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );
    
    console.log("Program ID:", program.programId.toString());
    console.log("Vault PDA:", vaultPda.toString());
    console.log("Vault SOL PDA:", vaultSolPda.toString());
    console.log("Stake Account PDA:", stakeAccountPda.toString());
  });

  it("1. Initializes the staking vault", async () => {
    const tx = await program.methods
      .initialize(provider.wallet.publicKey)
      .accounts({
        vault: vaultPda,
        vaultSol: vaultSolPda,
        payer: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("Initialize tx:", tx);
    
    // Verify vault state
    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.authority.toString(), provider.wallet.publicKey.toString());
    assert.equal(vault.totalStaked.toNumber(), 0);
    assert.equal(vault.stakerCount, 0);
    assert.equal(vault.isPaused, false);
    
    console.log("✓ Vault initialized successfully");
  });

  it("2. Rejects deposits below minimum (10 SOL)", async () => {
    const smallAmount = 5 * LAMPORTS_PER_SOL; // 5 SOL - below minimum
    
    try {
      await program.methods
        .deposit(new anchor.BN(smallAmount))
        .accounts({
          vault: vaultPda,
          vaultSol: vaultSolPda,
          stakeAccount: stakeAccountPda,
          staker: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      assert.fail("Should have rejected deposit below minimum");
    } catch (err) {
      assert.ok(err.message.includes("BelowMinimumStake") || err.logs?.some(l => l.includes("BelowMinimumStake")));
      console.log("✓ Correctly rejected deposit below 10 SOL minimum");
    }
  });

  it("3. Deposits 10 SOL successfully", async () => {
    const depositAmount = MINIMUM_STAKE; // 10 SOL
    
    // Get balances before
    const stakerBalanceBefore = await provider.connection.getBalance(provider.wallet.publicKey);
    
    const tx = await program.methods
      .deposit(new anchor.BN(depositAmount))
      .accounts({
        vault: vaultPda,
        vaultSol: vaultSolPda,
        stakeAccount: stakeAccountPda,
        staker: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("Deposit tx:", tx);
    
    // Verify vault state
    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.totalStaked.toNumber(), depositAmount);
    assert.equal(vault.stakerCount, 1);
    
    // Verify stake account
    const stakeAccount = await program.account.stakeAccount.fetch(stakeAccountPda);
    assert.equal(stakeAccount.staker.toString(), provider.wallet.publicKey.toString());
    assert.equal(stakeAccount.amount.toNumber(), depositAmount);
    
    // Verify SOL transferred
    const vaultSolBalance = await provider.connection.getBalance(vaultSolPda);
    assert.ok(vaultSolBalance >= depositAmount);
    
    console.log("✓ Deposited 10 SOL successfully");
    console.log("  - Vault total staked:", vault.totalStaked.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("  - Vault SOL balance:", vaultSolBalance / LAMPORTS_PER_SOL, "SOL");
    console.log("  - Staker count:", vault.stakerCount);
  });

  it("4. Deposits additional 5 SOL (adds to existing stake)", async () => {
    const additionalDeposit = 5 * LAMPORTS_PER_SOL; // 5 SOL
    
    const tx = await program.methods
      .deposit(new anchor.BN(additionalDeposit))
      .accounts({
        vault: vaultPda,
        vaultSol: vaultSolPda,
        stakeAccount: stakeAccountPda,
        staker: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("Additional deposit tx:", tx);
    
    // Verify updated state
    const vault = await program.account.vault.fetch(vaultPda);
    const expectedTotal = MINIMUM_STAKE + additionalDeposit;
    assert.equal(vault.totalStaked.toNumber(), expectedTotal);
    assert.equal(vault.stakerCount, 1); // Still 1 staker
    
    const stakeAccount = await program.account.stakeAccount.fetch(stakeAccountPda);
    assert.equal(stakeAccount.amount.toNumber(), expectedTotal);
    
    console.log("✓ Additional deposit successful");
    console.log("  - Total stake now:", vault.totalStaked.toNumber() / LAMPORTS_PER_SOL, "SOL");
  });

  it("5. Can read vault stats", async () => {
    const vault = await program.account.vault.fetch(vaultPda);
    
    console.log("\n=== Vault Stats ===");
    console.log("Authority:", vault.authority.toString());
    console.log("Total Staked:", vault.totalStaked.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("Yield Distributed:", vault.totalYieldDistributed.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("Subsidy Pool:", vault.totalSubsidyPool.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("Protocol Reserve:", vault.totalReserve.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("Staker Count:", vault.stakerCount);
    console.log("Is Paused:", vault.isPaused);
    console.log("==================\n");
    
    console.log("✓ Vault stats read successfully");
  });

  it("6. Rejects withdrawal leaving less than 10 SOL", async () => {
    // Currently have 15 SOL staked, try to withdraw 6 (leaving 9 SOL)
    const badWithdrawal = 6 * LAMPORTS_PER_SOL;
    
    try {
      await program.methods
        .withdraw(new anchor.BN(badWithdrawal))
        .accounts({
          vault: vaultPda,
          vaultSol: vaultSolPda,
          stakeAccount: stakeAccountPda,
          staker: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      assert.fail("Should have rejected withdrawal leaving < 10 SOL");
    } catch (err) {
      assert.ok(err.message.includes("BelowMinimumStake") || err.logs?.some(l => l.includes("BelowMinimumStake")));
      console.log("✓ Correctly rejected withdrawal that would leave < 10 SOL");
    }
  });

  it("7. Withdraws 5 SOL (leaves 10 SOL minimum)", async () => {
    const withdrawAmount = 5 * LAMPORTS_PER_SOL;
    
    const stakerBalanceBefore = await provider.connection.getBalance(provider.wallet.publicKey);
    
    const tx = await program.methods
      .withdraw(new anchor.BN(withdrawAmount))
      .accounts({
        vault: vaultPda,
        vaultSol: vaultSolPda,
        stakeAccount: stakeAccountPda,
        staker: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("Withdrawal tx:", tx);
    
    // Verify updated state
    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.totalStaked.toNumber(), 10 * LAMPORTS_PER_SOL); // 15 - 5 = 10
    assert.equal(vault.stakerCount, 1);
    
    const stakeAccount = await program.account.stakeAccount.fetch(stakeAccountPda);
    assert.equal(stakeAccount.amount.toNumber(), 10 * LAMPORTS_PER_SOL);
    
    // Verify SOL returned
    const stakerBalanceAfter = await provider.connection.getBalance(provider.wallet.publicKey);
    const balanceIncrease = stakerBalanceAfter - stakerBalanceBefore;
    assert.ok(balanceIncrease > 4.9 * LAMPORTS_PER_SOL); // ~5 SOL minus tx fee
    
    console.log("✓ Withdrew 5 SOL successfully");
    console.log("  - Remaining stake:", vault.totalStaked.toNumber() / LAMPORTS_PER_SOL, "SOL");
  });

  it("8. Withdraws all stake (full exit)", async () => {
    const stakeAccount = await program.account.stakeAccount.fetch(stakeAccountPda);
    const fullAmount = stakeAccount.amount.toNumber();
    
    const tx = await program.methods
      .withdraw(new anchor.BN(fullAmount))
      .accounts({
        vault: vaultPda,
        vaultSol: vaultSolPda,
        stakeAccount: stakeAccountPda,
        staker: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("Full withdrawal tx:", tx);
    
    // Verify vault state
    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.totalStaked.toNumber(), 0);
    assert.equal(vault.stakerCount, 0); // No more stakers
    
    // Stake account should still exist but with 0 balance
    const stakeAccountAfter = await program.account.stakeAccount.fetch(stakeAccountPda);
    assert.equal(stakeAccountAfter.amount.toNumber(), 0);
    
    console.log("✓ Full withdrawal successful - staker exited");
    console.log("  - Vault total staked:", vault.totalStaked.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("  - Staker count:", vault.stakerCount);
  });

  // =============== YIELD TESTS ===============
  
  it("9. Re-deposits for yield tests", async () => {
    // Re-deposit to test yield functionality
    const depositAmount = 20 * LAMPORTS_PER_SOL; // 20 SOL
    
    const tx = await program.methods
      .deposit(new anchor.BN(depositAmount))
      .accounts({
        vault: vaultPda,
        vaultSol: vaultSolPda,
        stakeAccount: stakeAccountPda,
        staker: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.totalStaked.toNumber(), depositAmount);
    
    console.log("✓ Re-deposited 20 SOL for yield tests");
  });

  it("10. Distributes yield with 70/20/10 split", async () => {
    // Authority distributes 10 SOL yield
    const yieldAmount = 10 * LAMPORTS_PER_SOL;
    
    // First, add SOL to the vault_sol PDA to cover yield payments
    // (In production, this would come from AI builder payments)
    const transferTx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: vaultSolPda,
        lamports: yieldAmount,
      })
    );
    await provider.sendAndConfirm(transferTx);
    
    // Now distribute yield
    const tx = await program.methods
      .distributeYield(new anchor.BN(yieldAmount))
      .accounts({
        vault: vaultPda,
        authority: provider.wallet.publicKey,
      })
      .rpc();
    
    console.log("Distribute yield tx:", tx);
    
    // Verify 70/20/10 split
    const vault = await program.account.vault.fetch(vaultPda);
    const expectedStakerShare = yieldAmount * 0.7;  // 7 SOL
    const expectedSubsidy = yieldAmount * 0.2;      // 2 SOL
    const expectedReserve = yieldAmount * 0.1;      // 1 SOL
    
    assert.equal(vault.totalYieldDistributed.toNumber(), expectedStakerShare);
    assert.equal(vault.totalSubsidyPool.toNumber(), expectedSubsidy);
    assert.equal(vault.totalReserve.toNumber(), expectedReserve);
    
    console.log("✓ Yield distributed with 70/20/10 split:");
    console.log("  - Staker share (70%):", vault.totalYieldDistributed.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("  - Subsidy pool (20%):", vault.totalSubsidyPool.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("  - Protocol reserve (10%):", vault.totalReserve.toNumber() / LAMPORTS_PER_SOL, "SOL");
  });

  it("11. Claims yield as staker", async () => {
    const stakerBalanceBefore = await provider.connection.getBalance(provider.wallet.publicKey);
    const stakeAccountBefore = await program.account.stakeAccount.fetch(stakeAccountPda);
    
    const tx = await program.methods
      .claimYield()
      .accounts({
        vault: vaultPda,
        vaultSol: vaultSolPda,
        stakeAccount: stakeAccountPda,
        staker: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log("Claim yield tx:", tx);
    
    const stakerBalanceAfter = await provider.connection.getBalance(provider.wallet.publicKey);
    const stakeAccountAfter = await program.account.stakeAccount.fetch(stakeAccountPda);
    
    // Since we're the only staker, we should get 100% of the staker share (7 SOL)
    const balanceIncrease = stakerBalanceAfter - stakerBalanceBefore;
    assert.ok(balanceIncrease > 6.9 * LAMPORTS_PER_SOL); // ~7 SOL minus tx fee
    
    console.log("✓ Claimed yield successfully");
    console.log("  - Yield claimed:", stakeAccountAfter.totalYieldClaimed.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("  - Balance increase:", balanceIncrease / LAMPORTS_PER_SOL, "SOL");
  });

  it("12. Pauses vault (admin only)", async () => {
    const tx = await program.methods
      .setPaused(true)
      .accounts({
        vault: vaultPda,
        authority: provider.wallet.publicKey,
      })
      .rpc();
    
    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.isPaused, true);
    
    console.log("✓ Vault paused successfully");
  });

  it("13. Rejects deposits when paused", async () => {
    try {
      await program.methods
        .deposit(new anchor.BN(10 * LAMPORTS_PER_SOL))
        .accounts({
          vault: vaultPda,
          vaultSol: vaultSolPda,
          stakeAccount: stakeAccountPda,
          staker: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      assert.fail("Should have rejected deposit when paused");
    } catch (err) {
      assert.ok(err.message.includes("VaultPaused") || err.logs?.some(l => l.includes("VaultPaused")));
      console.log("✓ Correctly rejected deposit when vault is paused");
    }
  });

  it("14. Unpauses vault", async () => {
    const tx = await program.methods
      .setPaused(false)
      .accounts({
        vault: vaultPda,
        authority: provider.wallet.publicKey,
      })
      .rpc();
    
    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.isPaused, false);
    
    console.log("✓ Vault unpaused successfully");
  });

  it("15. Final vault stats", async () => {
    const vault = await program.account.vault.fetch(vaultPda);
    const stakeAccount = await program.account.stakeAccount.fetch(stakeAccountPda);
    
    console.log("\n========== FINAL STATE ==========");
    console.log("Vault:");
    console.log("  - Total Staked:", vault.totalStaked.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("  - Yield Distributed:", vault.totalYieldDistributed.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("  - Subsidy Pool:", vault.totalSubsidyPool.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("  - Protocol Reserve:", vault.totalReserve.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("  - Staker Count:", vault.stakerCount);
    console.log("");
    console.log("Your Stake Account:");
    console.log("  - Amount Staked:", stakeAccount.amount.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("  - Total Yield Claimed:", stakeAccount.totalYieldClaimed.toNumber() / LAMPORTS_PER_SOL, "SOL");
    console.log("==================================\n");
    
    console.log("✓ All tests completed successfully!");
  });
});
