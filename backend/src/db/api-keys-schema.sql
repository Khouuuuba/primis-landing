-- =============================================
-- API KEYS SCHEMA
-- Sprint 4.1: Secure API key management
-- =============================================

-- API Keys table
-- Stores hashed API keys with metadata
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Key identification
  name VARCHAR(100) NOT NULL,                    -- User-friendly name ("Production Key")
  prefix VARCHAR(12) NOT NULL UNIQUE,            -- First 12 chars shown to user ("prmis_abc123")
  key_hash VARCHAR(64) NOT NULL,                 -- SHA-256 hash of full key (never store raw key)
  
  -- Permissions
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read'],  -- ['read', 'write', 'admin']
  
  -- Usage tracking
  last_used_at TIMESTAMP WITH TIME ZONE,
  request_count INTEGER DEFAULT 0,
  
  -- Rate limiting
  rate_limit INTEGER DEFAULT 100,                -- Requests per minute
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  revoked_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE           -- Optional expiration
);

-- Indexes for fast lookups
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(prefix);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;

-- API Key Usage Logs (for analytics)
CREATE TABLE api_key_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  
  -- Request details
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for usage queries
CREATE INDEX idx_api_key_usage_key_id ON api_key_usage(api_key_id);
CREATE INDEX idx_api_key_usage_created ON api_key_usage(created_at);

-- Rate limit tracking (sliding window)
CREATE TABLE api_rate_limits (
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  request_count INTEGER DEFAULT 1,
  PRIMARY KEY (api_key_id, window_start)
);

-- Auto-cleanup old rate limit windows (keep only last hour)
CREATE INDEX idx_rate_limits_window ON api_rate_limits(window_start);

-- =============================================
-- SECURITY NOTES:
-- 1. Never store raw API keys - only hash + prefix
-- 2. Prefix allows user to identify their keys
-- 3. Full key is shown ONCE at creation, then never again
-- 4. Use constant-time comparison for hash verification
-- =============================================
