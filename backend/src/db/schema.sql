-- Primis Protocol Database Schema
-- Run this in your PostgreSQL database (Supabase, Railway, or local)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================
-- USERS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    privy_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255),
    wallet_address VARCHAR(64),
    user_type VARCHAR(20) NOT NULL DEFAULT 'both', -- 'capital_provider', 'ai_builder', 'both'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_privy_id ON users(privy_id);
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);

-- =====================
-- STAKES TABLE (Capital Providers)
-- =====================
CREATE TABLE IF NOT EXISTS stakes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount_sol DECIMAL(20, 9) NOT NULL DEFAULT 0, -- SOL has 9 decimals
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'pending_withdrawal', 'withdrawn'
    staked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    unstaked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stakes_user ON stakes(user_id);
CREATE INDEX IF NOT EXISTS idx_stakes_status ON stakes(status);

-- =====================
-- EARNINGS TABLE (Capital Providers)
-- =====================
CREATE TABLE IF NOT EXISTS earnings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    stake_id UUID REFERENCES stakes(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL, -- 'base_yield', 'compute_revenue'
    amount_sol DECIMAL(20, 9) NOT NULL,
    source_job_id UUID, -- If from compute revenue, link to job
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_earnings_user ON earnings(user_id);
CREATE INDEX IF NOT EXISTS idx_earnings_type ON earnings(type);

-- =====================
-- CREDITS TABLE (AI Builders)
-- =====================
CREATE TABLE IF NOT EXISTS credits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    balance_usd DECIMAL(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credits_user ON credits(user_id);

-- =====================
-- CREDIT TRANSACTIONS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL, -- 'purchase', 'usage', 'refund'
    amount_usd DECIMAL(12, 2) NOT NULL,
    stripe_payment_id VARCHAR(255),
    job_id UUID,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions(user_id);

-- =====================
-- JOBS TABLE (AI Builders)
-- =====================
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255),
    gpu_type VARCHAR(50) NOT NULL, -- 'gpu-a100-40', 'gpu-h100-80', etc.
    gpu_count INTEGER NOT NULL DEFAULT 1,
    hours DECIMAL(6, 2) NOT NULL,
    workload_type VARCHAR(50), -- 'training', 'fine-tuning', 'inference', 'other'
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'terminated', 'failed'
    progress INTEGER DEFAULT 0, -- 0-100
    cost_usd DECIMAL(12, 2) NOT NULL,
    provider VARCHAR(50), -- 'runpod', 'lambda_labs'
    provider_job_id VARCHAR(255), -- External provider's job ID
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- =====================
-- PROTOCOL STATS TABLE (Aggregate metrics)
-- =====================
CREATE TABLE IF NOT EXISTS protocol_stats (
    id SERIAL PRIMARY KEY,
    total_staked_sol DECIMAL(20, 9) DEFAULT 0,
    total_stakers INTEGER DEFAULT 0,
    total_jobs_completed INTEGER DEFAULT 0,
    total_compute_revenue_usd DECIMAL(12, 2) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert initial row
INSERT INTO protocol_stats (total_staked_sol, total_stakers, total_jobs_completed, total_compute_revenue_usd)
VALUES (0, 0, 0, 0)
ON CONFLICT DO NOTHING;

-- =====================
-- HELPER FUNCTIONS
-- =====================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stakes_updated_at ON stakes;
CREATE TRIGGER update_stakes_updated_at BEFORE UPDATE ON stakes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_credits_updated_at ON credits;
CREATE TRIGGER update_credits_updated_at BEFORE UPDATE ON credits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================
-- VIEWS (for easy querying)
-- =====================

-- User portfolio view (for Capital Providers)
CREATE OR REPLACE VIEW user_portfolio AS
SELECT 
    u.id as user_id,
    u.email,
    u.wallet_address,
    COALESCE(SUM(s.amount_sol) FILTER (WHERE s.status = 'active'), 0) as total_staked,
    COALESCE(SUM(e.amount_sol) FILTER (WHERE e.type = 'base_yield'), 0) as total_yield_earned,
    COALESCE(SUM(e.amount_sol) FILTER (WHERE e.type = 'compute_revenue'), 0) as total_revenue_earned,
    COALESCE(SUM(e.amount_sol), 0) as total_earned
FROM users u
LEFT JOIN stakes s ON u.id = s.user_id
LEFT JOIN earnings e ON u.id = e.user_id
GROUP BY u.id, u.email, u.wallet_address;

-- User jobs summary view (for AI Builders)
CREATE OR REPLACE VIEW user_jobs_summary AS
SELECT 
    u.id as user_id,
    u.email,
    COALESCE(c.balance_usd, 0) as credit_balance,
    COUNT(j.id) FILTER (WHERE j.status IN ('pending', 'running')) as active_jobs,
    COUNT(j.id) FILTER (WHERE j.status = 'completed') as completed_jobs,
    COALESCE(SUM(j.cost_usd) FILTER (WHERE j.status = 'completed'), 0) as total_spent
FROM users u
LEFT JOIN credits c ON u.id = c.user_id
LEFT JOIN jobs j ON u.id = j.user_id
GROUP BY u.id, u.email, c.balance_usd;
