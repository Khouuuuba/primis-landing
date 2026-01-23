-- Yield Distribution Tracking Schema
-- Run this in Supabase SQL Editor

-- Yield distributions (each time protocol distributes yield)
CREATE TABLE IF NOT EXISTS yield_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Distribution details
    total_yield_lamports BIGINT NOT NULL,        -- Total yield distributed (in lamports)
    staker_share_lamports BIGINT NOT NULL,       -- 70% to stakers
    subsidy_share_lamports BIGINT NOT NULL,      -- 20% to AI builder subsidy
    reserve_share_lamports BIGINT NOT NULL,      -- 10% to protocol reserve
    
    -- Context
    total_staked_lamports BIGINT NOT NULL,       -- TVL at time of distribution
    staker_count INTEGER NOT NULL,               -- Number of stakers
    
    -- Source (for transparency)
    source VARCHAR(50) NOT NULL DEFAULT 'simulated',  -- 'simulated', 'staking_rewards', 'compute_revenue'
    
    -- Blockchain reference
    tx_signature VARCHAR(100),                   -- Solana transaction signature
    
    -- Timestamps
    distributed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User yield claims
CREATE TABLE IF NOT EXISTS yield_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User reference
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    wallet_address VARCHAR(50) NOT NULL,
    
    -- Claim details
    amount_lamports BIGINT NOT NULL,             -- Amount claimed
    amount_sol DECIMAL(20, 9) NOT NULL,          -- Amount in SOL for display
    
    -- Blockchain reference
    tx_signature VARCHAR(100) NOT NULL,
    
    -- Timestamps
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Yield snapshots (daily state for analytics)
CREATE TABLE IF NOT EXISTS yield_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Snapshot data
    date DATE NOT NULL UNIQUE,
    total_staked_sol DECIMAL(20, 9) NOT NULL,
    total_yield_distributed_sol DECIMAL(20, 9) NOT NULL,
    total_subsidy_pool_sol DECIMAL(20, 9) NOT NULL,
    total_reserve_sol DECIMAL(20, 9) NOT NULL,
    staker_count INTEGER NOT NULL,
    
    -- Calculated APY for that day
    daily_apy_percent DECIMAL(10, 4),
    
    -- Timestamps
    snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_yield_distributions_distributed_at ON yield_distributions(distributed_at DESC);
CREATE INDEX IF NOT EXISTS idx_yield_claims_user_id ON yield_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_yield_claims_wallet ON yield_claims(wallet_address);
CREATE INDEX IF NOT EXISTS idx_yield_snapshots_date ON yield_snapshots(date DESC);

-- Add estimated_yield column to users for caching claimable amount
ALTER TABLE users ADD COLUMN IF NOT EXISTS estimated_claimable_yield_sol DECIMAL(20, 9) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_yield_calculation TIMESTAMP WITH TIME ZONE;
