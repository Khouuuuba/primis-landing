-- Batch Jobs Schema
-- Run this after the main schema.sql

-- =====================
-- BATCH JOBS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS batch_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    template VARCHAR(50) NOT NULL DEFAULT 'sdxl', -- 'sdxl', 'sd15', 'flux', etc.
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    total_items INTEGER NOT NULL DEFAULT 0,
    completed_items INTEGER NOT NULL DEFAULT 0,
    failed_items INTEGER NOT NULL DEFAULT 0,
    cost_per_image DECIMAL(10, 4) NOT NULL DEFAULT 0.01, -- $0.01 per image
    total_cost DECIMAL(12, 2) NOT NULL DEFAULT 0,
    options JSONB DEFAULT '{}', -- width, height, steps, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_user ON batch_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status);

-- =====================
-- BATCH ITEMS TABLE (individual prompts)
-- =====================
CREATE TABLE IF NOT EXISTS batch_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_job_id UUID REFERENCES batch_jobs(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    negative_prompt TEXT DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    runpod_job_id VARCHAR(255), -- RunPod's job ID for this item
    result_url TEXT, -- URL to the generated image
    result_data JSONB, -- Any additional result data
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_batch_items_job ON batch_items(batch_job_id);
CREATE INDEX IF NOT EXISTS idx_batch_items_status ON batch_items(status);
CREATE INDEX IF NOT EXISTS idx_batch_items_runpod ON batch_items(runpod_job_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_batch_jobs_updated_at ON batch_jobs;
CREATE TRIGGER update_batch_jobs_updated_at BEFORE UPDATE ON batch_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
