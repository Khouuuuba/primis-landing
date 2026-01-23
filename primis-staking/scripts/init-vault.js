const anchor = require("@coral-xyz/anchor");
const { SystemProgram, PublicKey } = require("@solana/web3.js");

async function main() {
  // Configure the client to use devnet
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PrimisStaking;
  
  console.log("Program ID:", program.programId.toString());
  console.log("Wallet:", provider.wallet.publicKey.toString());
  
  // Find PDAs
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    program.programId
  );
  
  const [vaultSolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_sol")],
    program.programId
  );
  
  console.log("Vault PDA:", vaultPda.toString());
  console.log("Vault SOL PDA:", vaultSolPda.toString());
  
  // Check if vault already exists
  const vaultAccount = await provider.connection.getAccountInfo(vaultPda);
  if (vaultAccount) {
    console.log("\nVault already initialized!");
    return;
  }
  
  console.log("\nInitializing vault...");
  
  const tx = await program.methods
    .initialize(provider.wallet.publicKey)
    .accounts({
      vault: vaultPda,
      vaultSol: vaultSolPda,
      payer: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  
  console.log("Transaction:", tx);
  console.log("Vault initialized successfully!");
  console.log("\nView on Solscan: https://solscan.io/tx/" + tx + "?cluster=devnet");
}

main().catch(console.error);
