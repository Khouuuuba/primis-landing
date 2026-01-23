use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("Bp4pmvckwNicvQrxafeCgrM35WnTE1qz2MbvGWA4GhDf");

// Constants based on user decisions
pub const MINIMUM_STAKE: u64 = 10 * 1_000_000_000; // 10 SOL in lamports
pub const STAKER_YIELD_BPS: u16 = 7000;  // 70% to stakers
pub const SUBSIDY_BPS: u16 = 2000;       // 20% for AI builder subsidy
pub const RESERVE_BPS: u16 = 1000;       // 10% protocol reserve
pub const BPS_DENOMINATOR: u16 = 10000;

#[program]
pub mod primis_staking {
    use super::*;

    /// Initialize the staking vault
    pub fn initialize(ctx: Context<Initialize>, authority: Pubkey) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = authority;
        vault.total_staked = 0;
        vault.total_yield_distributed = 0;
        vault.total_subsidy_pool = 0;
        vault.total_reserve = 0;
        vault.staker_count = 0;
        vault.is_paused = false;
        vault.bump = ctx.bumps.vault;
        
        msg!("Primis Staking Vault initialized");
        Ok(())
    }

    /// Deposit SOL into the staking vault
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.vault.is_paused, PrimisError::VaultPaused);
        
        // Minimum stake only applies to first deposit (new stakers)
        let is_new_staker = ctx.accounts.stake_account.amount == 0;
        if is_new_staker {
            require!(amount >= MINIMUM_STAKE, PrimisError::BelowMinimumStake);
        }

        let vault = &mut ctx.accounts.vault;
        let stake_account = &mut ctx.accounts.stake_account;
        
        // Transfer SOL from user to vault
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.staker.to_account_info(),
                to: ctx.accounts.vault_sol.to_account_info(),
            },
        );
        system_program::transfer(cpi_context, amount)?;

        // Update stake account
        if stake_account.amount == 0 {
            // New staker
            vault.staker_count += 1;
            stake_account.staker = ctx.accounts.staker.key();
            stake_account.deposited_at = Clock::get()?.unix_timestamp;
            stake_account.bump = ctx.bumps.stake_account;
        }
        
        stake_account.amount += amount;
        stake_account.last_yield_claim = Clock::get()?.unix_timestamp;
        
        // Update vault totals
        vault.total_staked += amount;

        emit!(StakeDeposited {
            staker: ctx.accounts.staker.key(),
            amount,
            total_staked: stake_account.amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Deposited {} lamports. Total stake: {}", amount, stake_account.amount);
        Ok(())
    }

    /// Withdraw SOL from the staking vault
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let stake_account = &ctx.accounts.stake_account;
        require!(stake_account.amount >= amount, PrimisError::InsufficientStake);
        require!(!ctx.accounts.vault.is_paused, PrimisError::VaultPaused);

        // Calculate remaining stake after withdrawal
        let remaining = stake_account.amount - amount;
        if remaining > 0 {
            require!(remaining >= MINIMUM_STAKE, PrimisError::BelowMinimumStake);
        }

        // Transfer SOL from vault_sol PDA to user using CPI with PDA signer
        let vault_sol_bump = ctx.bumps.vault_sol;
        let seeds = &[b"vault_sol".as_ref(), &[vault_sol_bump]];
        let signer_seeds = &[&seeds[..]];
        
        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.vault_sol.to_account_info(),
                to: ctx.accounts.staker.to_account_info(),
            },
            signer_seeds,
        );
        system_program::transfer(cpi_context, amount)?;

        // Update accounts
        let vault = &mut ctx.accounts.vault;
        let stake_account = &mut ctx.accounts.stake_account;
        
        stake_account.amount -= amount;
        vault.total_staked -= amount;
        
        if stake_account.amount == 0 {
            vault.staker_count -= 1;
        }

        emit!(StakeWithdrawn {
            staker: ctx.accounts.staker.key(),
            amount,
            remaining_stake: stake_account.amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Withdrew {} lamports. Remaining stake: {}", amount, stake_account.amount);
        Ok(())
    }

    /// Distribute yield to the vault (called by protocol)
    pub fn distribute_yield(ctx: Context<DistributeYield>, total_yield: u64) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.vault.authority,
            PrimisError::Unauthorized
        );

        let vault = &mut ctx.accounts.vault;
        
        // Calculate splits based on protocol parameters (70/20/10)
        let staker_share = (total_yield as u128 * STAKER_YIELD_BPS as u128 / BPS_DENOMINATOR as u128) as u64;
        let subsidy_share = (total_yield as u128 * SUBSIDY_BPS as u128 / BPS_DENOMINATOR as u128) as u64;
        let reserve_share = total_yield - staker_share - subsidy_share;

        vault.total_yield_distributed += staker_share;
        vault.total_subsidy_pool += subsidy_share;
        vault.total_reserve += reserve_share;
        vault.last_yield_distribution = Clock::get()?.unix_timestamp;

        emit!(YieldDistributed {
            total_yield,
            staker_share,
            subsidy_share,
            reserve_share,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Distributed yield: {} to stakers, {} to subsidy, {} to reserve", 
            staker_share, subsidy_share, reserve_share);
        Ok(())
    }

    /// Claim accumulated yield
    pub fn claim_yield(ctx: Context<ClaimYield>) -> Result<()> {
        let vault = &ctx.accounts.vault;
        let stake_account = &ctx.accounts.stake_account;
        
        require!(stake_account.amount > 0, PrimisError::NoStake);
        require!(vault.total_staked > 0, PrimisError::NoStake);

        // Calculate user's share of yield based on their stake proportion
        let user_share_bps = (stake_account.amount as u128 * BPS_DENOMINATOR as u128 
            / vault.total_staked as u128) as u64;
        
        // Calculate claimable yield (simplified - in production would track per-user)
        let claimable = (vault.total_yield_distributed as u128 * user_share_bps as u128 
            / BPS_DENOMINATOR as u128) as u64;

        if claimable > 0 {
            // Transfer yield to staker using CPI with PDA signer
            let vault_sol_bump = ctx.bumps.vault_sol;
            let seeds = &[b"vault_sol".as_ref(), &[vault_sol_bump]];
            let signer_seeds = &[&seeds[..]];
            
            let cpi_context = CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.vault_sol.to_account_info(),
                    to: ctx.accounts.staker.to_account_info(),
                },
                signer_seeds,
            );
            system_program::transfer(cpi_context, claimable)?;
            
            let stake_account = &mut ctx.accounts.stake_account;
            stake_account.total_yield_claimed += claimable;
            stake_account.last_yield_claim = Clock::get()?.unix_timestamp;

            emit!(YieldClaimed {
                staker: ctx.accounts.staker.key(),
                amount: claimable,
                timestamp: Clock::get()?.unix_timestamp,
            });

            msg!("Claimed {} lamports in yield", claimable);
        }

        Ok(())
    }

    /// Pause/unpause the vault (admin only)
    pub fn set_paused(ctx: Context<AdminAction>, paused: bool) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.vault.authority,
            PrimisError::Unauthorized
        );
        
        ctx.accounts.vault.is_paused = paused;
        msg!("Vault paused: {}", paused);
        Ok(())
    }
}

// ============== ACCOUNTS ==============

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, Vault>,
    
    /// CHECK: This is the PDA that holds SOL
    #[account(
        mut,
        seeds = [b"vault_sol"],
        bump
    )]
    pub vault_sol: AccountInfo<'info>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"vault"],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,
    
    /// CHECK: PDA holding SOL
    #[account(
        mut,
        seeds = [b"vault_sol"],
        bump
    )]
    pub vault_sol: AccountInfo<'info>,
    
    #[account(
        init_if_needed,
        payer = staker,
        space = 8 + StakeAccount::INIT_SPACE,
        seeds = [b"stake", staker.key().as_ref()],
        bump
    )]
    pub stake_account: Account<'info, StakeAccount>,
    
    #[account(mut)]
    pub staker: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault"],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,
    
    /// CHECK: PDA holding SOL
    #[account(
        mut,
        seeds = [b"vault_sol"],
        bump
    )]
    pub vault_sol: AccountInfo<'info>,
    
    #[account(
        mut,
        seeds = [b"stake", staker.key().as_ref()],
        bump = stake_account.bump,
        has_one = staker
    )]
    pub stake_account: Account<'info, StakeAccount>,
    
    #[account(mut)]
    pub staker: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DistributeYield<'info> {
    #[account(
        mut,
        seeds = [b"vault"],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimYield<'info> {
    #[account(
        seeds = [b"vault"],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,
    
    /// CHECK: PDA holding SOL
    #[account(
        mut,
        seeds = [b"vault_sol"],
        bump
    )]
    pub vault_sol: AccountInfo<'info>,
    
    #[account(
        mut,
        seeds = [b"stake", staker.key().as_ref()],
        bump = stake_account.bump,
        has_one = staker
    )]
    pub stake_account: Account<'info, StakeAccount>,
    
    #[account(mut)]
    pub staker: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminAction<'info> {
    #[account(
        mut,
        seeds = [b"vault"],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,
    
    pub authority: Signer<'info>,
}

// ============== STATE ==============

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub authority: Pubkey,           // Protocol admin
    pub total_staked: u64,           // Total SOL staked
    pub total_yield_distributed: u64, // Total yield given to stakers
    pub total_subsidy_pool: u64,     // AI builder subsidy pool
    pub total_reserve: u64,          // Protocol reserve
    pub staker_count: u32,           // Number of active stakers
    pub last_yield_distribution: i64, // Timestamp
    pub is_paused: bool,             // Emergency pause
    pub bump: u8,                    // PDA bump
}

#[account]
#[derive(InitSpace)]
pub struct StakeAccount {
    pub staker: Pubkey,              // Owner
    pub amount: u64,                 // Staked amount
    pub deposited_at: i64,           // First deposit timestamp
    pub last_yield_claim: i64,       // Last claim timestamp
    pub total_yield_claimed: u64,    // Lifetime yield claimed
    pub bump: u8,                    // PDA bump
}

// ============== EVENTS ==============

#[event]
pub struct StakeDeposited {
    pub staker: Pubkey,
    pub amount: u64,
    pub total_staked: u64,
    pub timestamp: i64,
}

#[event]
pub struct StakeWithdrawn {
    pub staker: Pubkey,
    pub amount: u64,
    pub remaining_stake: u64,
    pub timestamp: i64,
}

#[event]
pub struct YieldDistributed {
    pub total_yield: u64,
    pub staker_share: u64,
    pub subsidy_share: u64,
    pub reserve_share: u64,
    pub timestamp: i64,
}

#[event]
pub struct YieldClaimed {
    pub staker: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

// ============== ERRORS ==============

#[error_code]
pub enum PrimisError {
    #[msg("Stake amount is below minimum of 10 SOL")]
    BelowMinimumStake,
    #[msg("Insufficient stake balance")]
    InsufficientStake,
    #[msg("No active stake found")]
    NoStake,
    #[msg("Vault is currently paused")]
    VaultPaused,
    #[msg("Unauthorized action")]
    Unauthorized,
}
