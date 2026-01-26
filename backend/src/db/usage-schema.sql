-- =============================================
-- Usage Logs Schema for Serverless Inference
-- =============================================
-- Run this in Supabase SQL Editor

-- Usage logs table - tracks all serverless usage
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_id TEXT NOT NULL,
  service TEXT NOT NULL,           -- 'text-generation', 'image-generation', 'audio-transcription'
  model TEXT NOT NULL,             -- 'llama-3-8b', 'llama-3-70b', 'sdxl', 'whisper-large'
  input_tokens INTEGER DEFAULT 0,  -- For text: input tokens
  output_tokens INTEGER DEFAULT 0, -- For text: output tokens
  input_size INTEGER DEFAULT 0,    -- For audio: bytes
  output_size INTEGER DEFAULT 0,   -- For images: bytes
  duration_seconds NUMERIC(10, 2) DEFAULT 0, -- For audio: duration in seconds
  cost NUMERIC(10, 6) NOT NULL,    -- Actual cost charged
  duration_ms INTEGER DEFAULT 0,   -- Processing time in ms
  status TEXT DEFAULT 'completed', -- 'completed', 'failed'
  error_message TEXT,
  metadata JSONB DEFAULT '{}',     -- Additional data (prompts, settings, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_usage_logs_privy_id ON usage_logs(privy_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_service ON usage_logs(service);

-- Enable RLS
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their own usage
CREATE POLICY "Users can view own usage" ON usage_logs
  FOR SELECT USING (auth.uid()::text = privy_id OR privy_id = current_setting('app.current_user', true));

-- Policy: system can insert usage logs
CREATE POLICY "System can insert usage" ON usage_logs
  FOR INSERT WITH CHECK (true);

-- =============================================
-- Usage Summary View
-- =============================================

CREATE OR REPLACE VIEW usage_summary AS
SELECT 
  privy_id,
  service,
  model,
  COUNT(*) as request_count,
  SUM(cost) as total_cost,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  AVG(duration_ms) as avg_duration_ms,
  DATE_TRUNC('day', created_at) as date
FROM usage_logs
GROUP BY privy_id, service, model, DATE_TRUNC('day', created_at);

-- =============================================
-- Sample queries for analytics
-- =============================================

-- Get user's total spend by service
-- SELECT service, SUM(cost) as total_spend 
-- FROM usage_logs 
-- WHERE privy_id = 'user123' 
-- GROUP BY service;

-- Get daily usage for a user
-- SELECT DATE_TRUNC('day', created_at) as day, COUNT(*) as requests, SUM(cost) as cost
-- FROM usage_logs
-- WHERE privy_id = 'user123'
-- GROUP BY DATE_TRUNC('day', created_at)
-- ORDER BY day DESC;
