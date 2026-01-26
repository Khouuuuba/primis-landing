-- =============================================
-- PRIMIS AI AGENT PLATFORM - DATABASE SCHEMA
-- =============================================
-- Run this in Supabase SQL Editor

-- =============================================
-- 1. AGENTS TABLE
-- Stores agent configurations and metadata
-- =============================================

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Basic info
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Framework & Runtime
  framework VARCHAR(50) DEFAULT 'custom', -- langchain, crewai, autogen, eliza, custom
  runtime VARCHAR(20) DEFAULT 'python', -- python, nodejs
  entry_point VARCHAR(255) DEFAULT 'main.py', -- or index.js for Node
  
  -- Code storage
  code_url TEXT, -- Supabase Storage URL for uploaded code
  repo_url TEXT, -- Git repo URL (alternative to upload)
  
  -- Environment
  environment JSONB DEFAULT '{}', -- env vars (encrypted in production)
  
  -- RunPod integration
  runpod_endpoint_id VARCHAR(255), -- RunPod serverless endpoint ID
  runpod_template_id VARCHAR(255), -- RunPod template used
  
  -- Webhook
  webhook_token VARCHAR(255), -- Token for webhook authentication
  
  -- Status & scaling
  status VARCHAR(50) DEFAULT 'draft', -- draft, deploying, running, stopped, failed
  status_message TEXT, -- Error message or status details
  replicas INTEGER DEFAULT 1, -- Number of workers (1-8)
  min_replicas INTEGER DEFAULT 0, -- Scale to zero support
  max_replicas INTEGER DEFAULT 4,
  
  -- Resource config
  gpu_type VARCHAR(50) DEFAULT 'NVIDIA RTX A4000', -- GPU for inference
  memory_gb INTEGER DEFAULT 8,
  timeout_seconds INTEGER DEFAULT 30, -- Max execution time per request
  
  -- Billing
  cost_per_second DECIMAL(10, 6) DEFAULT 0.0001, -- Cost per second of execution
  total_cost_usd DECIMAL(12, 4) DEFAULT 0,
  total_runs INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deployed_at TIMESTAMP,
  last_run_at TIMESTAMP
);

-- Indexes for agents
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_framework ON agents(framework);

-- =============================================
-- 2. AGENT RUNS TABLE
-- Tracks every agent invocation
-- =============================================

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  
  -- Invocation details
  trigger_type VARCHAR(50) DEFAULT 'api', -- api, webhook, schedule, manual
  input JSONB, -- Input payload
  output JSONB, -- Output response
  
  -- Execution trace (for debugging)
  steps JSONB DEFAULT '[]', -- Array of {thought, action, observation}
  
  -- Metrics
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_total INTEGER DEFAULT 0,
  duration_ms INTEGER,
  cost_usd DECIMAL(10, 6) DEFAULT 0,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- pending, running, completed, failed, timeout
  error_message TEXT,
  
  -- Timestamps
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Indexes for agent_runs
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_id ON agent_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_user_id ON agent_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at ON agent_runs(started_at DESC);

-- =============================================
-- 3. AGENT TEMPLATES TABLE
-- Pre-built agent templates for quick start
-- =============================================

CREATE TABLE IF NOT EXISTS agent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Template info
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100), -- chatbot, trading, research, support, automation
  
  -- Framework & code
  framework VARCHAR(50) NOT NULL,
  runtime VARCHAR(20) DEFAULT 'python',
  code_url TEXT NOT NULL, -- Template code in storage
  entry_point VARCHAR(255) DEFAULT 'main.py',
  
  -- Default config
  default_env JSONB DEFAULT '{}',
  default_gpu VARCHAR(50) DEFAULT 'NVIDIA RTX A4000',
  
  -- Metadata
  icon VARCHAR(50), -- Icon name or emoji
  tags TEXT[], -- ['defi', 'trading', 'solana']
  popularity INTEGER DEFAULT 0, -- Deploy count
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 4. INSERT DEFAULT TEMPLATES
-- =============================================

INSERT INTO agent_templates (name, description, category, framework, runtime, code_url, entry_point, default_env, icon, tags, is_featured) VALUES
(
  'RAG Chatbot',
  'Answer questions from your documents using retrieval-augmented generation. Upload PDFs, docs, or text files and chat with them.',
  'chatbot',
  'langchain',
  'python',
  'templates/rag-chatbot.zip',
  'main.py',
  '{"OPENAI_API_KEY": "", "CHUNK_SIZE": "1000"}',
  '💬',
  ARRAY['chatbot', 'rag', 'documents'],
  true
),
(
  'DeFi Price Monitor',
  'Monitor token prices on Solana and send alerts when thresholds are crossed. Supports Jupiter, Raydium, and Orca.',
  'trading',
  'custom',
  'python',
  'templates/defi-monitor.zip',
  'main.py',
  '{"SOLANA_RPC": "https://api.mainnet-beta.solana.com", "ALERT_WEBHOOK": ""}',
  '📊',
  ARRAY['defi', 'solana', 'trading', 'alerts'],
  true
),
(
  'Trading Bot (CrewAI)',
  'Multi-agent trading system with analyst, risk manager, and executor agents. Paper trading by default.',
  'trading',
  'crewai',
  'python',
  'templates/trading-crew.zip',
  'main.py',
  '{"OPENAI_API_KEY": "", "PAPER_TRADING": "true"}',
  '🤖',
  ARRAY['trading', 'multi-agent', 'crewai'],
  true
),
(
  'Research Agent',
  'Deep web research agent that browses the internet, summarizes findings, and generates reports.',
  'research',
  'langgraph',
  'python',
  'templates/research-agent.zip',
  'main.py',
  '{"OPENAI_API_KEY": "", "TAVILY_API_KEY": ""}',
  '🔍',
  ARRAY['research', 'web', 'summarization'],
  true
),
(
  'ELIZA Starter',
  'Basic ELIZA OS agent template. Build conversational AI agents with the ELIZA framework.',
  'chatbot',
  'eliza',
  'nodejs',
  'templates/eliza-starter.zip',
  'index.js',
  '{"OPENAI_API_KEY": ""}',
  '🎭',
  ARRAY['eliza', 'chatbot', 'typescript'],
  true
)
ON CONFLICT DO NOTHING;

-- =============================================
-- 5. UPDATE TRIGGER FOR updated_at
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to agents table
DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to agent_templates table
DROP TRIGGER IF EXISTS update_agent_templates_updated_at ON agent_templates;
CREATE TRIGGER update_agent_templates_updated_at
  BEFORE UPDATE ON agent_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 6. VIEWS FOR ANALYTICS
-- =============================================

-- Agent summary view
CREATE OR REPLACE VIEW agent_summary AS
SELECT 
  a.id,
  a.user_id,
  a.name,
  a.framework,
  a.status,
  a.total_runs,
  a.total_cost_usd,
  a.created_at,
  a.last_run_at,
  COUNT(ar.id) as runs_last_24h,
  COALESCE(SUM(ar.cost_usd), 0) as cost_last_24h
FROM agents a
LEFT JOIN agent_runs ar ON ar.agent_id = a.id 
  AND ar.started_at > NOW() - INTERVAL '24 hours'
GROUP BY a.id;

-- =============================================
-- DONE! Run this in Supabase SQL Editor.
-- =============================================
