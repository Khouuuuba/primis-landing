-- Moltbot Instances Schema
-- Run this migration to set up Moltbot deployment tracking

-- ============================================================================
-- MOLTBOT INSTANCES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS moltbot_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  
  -- Railway identifiers
  railway_project_id TEXT,
  railway_service_id TEXT,
  railway_environment_id TEXT,
  railway_deployment_id TEXT,
  
  -- Connection info
  railway_url TEXT,
  
  -- Configuration
  ai_provider TEXT NOT NULL CHECK (ai_provider IN ('anthropic', 'openai')),
  channels TEXT[] DEFAULT '{}',
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Initial state
    'deploying',    -- Railway creating service
    'building',     -- Docker build in progress
    'running',      -- Active and healthy
    'stopped',      -- Paused by user
    'failed',       -- Deployment failed
    'terminated'    -- Deleted
  )),
  error_message TEXT,
  
  -- Billing
  subscription_id TEXT,
  subscription_status TEXT DEFAULT 'trialing' CHECK (subscription_status IN (
    'trialing', 'active', 'past_due', 'canceled', 'unpaid'
  )),
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deployed_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  terminated_at TIMESTAMPTZ,
  
  -- Usage tracking
  total_uptime_seconds INTEGER DEFAULT 0,
  last_health_check TIMESTAMPTZ,
  health_check_failures INTEGER DEFAULT 0
);

-- ============================================================================
-- MOLTBOT SECRETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS moltbot_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES moltbot_instances(id) ON DELETE CASCADE,
  
  -- Secret identification
  key_name TEXT NOT NULL,  -- e.g., 'ANTHROPIC_API_KEY', 'TELEGRAM_BOT_TOKEN'
  
  -- Encrypted value (AES-256-GCM)
  -- All values stored as base64
  encrypted_value TEXT NOT NULL,
  iv TEXT NOT NULL,           -- Initialization vector (base64)
  auth_tag TEXT NOT NULL,     -- Authentication tag (base64)
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Each instance can only have one secret per key name
  UNIQUE(instance_id, key_name)
);

-- ============================================================================
-- MOLTBOT DEPLOYMENT LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS moltbot_deployment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES moltbot_instances(id) ON DELETE CASCADE,
  
  -- Log details
  event_type TEXT NOT NULL,  -- 'deploy', 'build', 'start', 'stop', 'error', 'health_check'
  message TEXT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_moltbot_instances_user_id ON moltbot_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_moltbot_instances_status ON moltbot_instances(status);
CREATE INDEX IF NOT EXISTS idx_moltbot_instances_subscription ON moltbot_instances(subscription_status);
CREATE INDEX IF NOT EXISTS idx_moltbot_secrets_instance_id ON moltbot_secrets(instance_id);
CREATE INDEX IF NOT EXISTS idx_moltbot_deployment_logs_instance_id ON moltbot_deployment_logs(instance_id);
CREATE INDEX IF NOT EXISTS idx_moltbot_deployment_logs_created_at ON moltbot_deployment_logs(created_at);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_moltbot_secrets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_moltbot_secrets_updated_at ON moltbot_secrets;
CREATE TRIGGER trigger_moltbot_secrets_updated_at
  BEFORE UPDATE ON moltbot_secrets
  FOR EACH ROW
  EXECUTE FUNCTION update_moltbot_secrets_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE moltbot_instances IS 'Tracks Moltbot deployments on Railway';
COMMENT ON TABLE moltbot_secrets IS 'Encrypted user secrets (API keys, bot tokens)';
COMMENT ON TABLE moltbot_deployment_logs IS 'Deployment and health check logs';

COMMENT ON COLUMN moltbot_instances.ai_provider IS 'AI provider: anthropic or openai';
COMMENT ON COLUMN moltbot_instances.channels IS 'Array of enabled channels: telegram, discord, etc';
COMMENT ON COLUMN moltbot_secrets.encrypted_value IS 'AES-256-GCM encrypted secret (base64)';
COMMENT ON COLUMN moltbot_secrets.iv IS 'Initialization vector for decryption (base64)';
COMMENT ON COLUMN moltbot_secrets.auth_tag IS 'Authentication tag for integrity check (base64)';
