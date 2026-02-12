-- ============================================================================
-- USAGE TRACKING SCHEMA
-- Tracks AI message usage per user for billing (200 msgs/month @ $30/mo)
-- ============================================================================

-- Message log: one row per AI request
CREATE TABLE IF NOT EXISTS usage_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  instance_id UUID REFERENCES moltbot_instances(id) ON DELETE SET NULL,
  model TEXT DEFAULT 'claude-opus-4',
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookup: count messages per user per month
CREATE INDEX IF NOT EXISTS idx_usage_messages_user_month 
  ON usage_messages (user_id, created_at);

-- Fast lookup: messages per instance
CREATE INDEX IF NOT EXISTS idx_usage_messages_instance
  ON usage_messages (instance_id, created_at);

-- User quotas: monthly limits and bonus messages
CREATE TABLE IF NOT EXISTS usage_quotas (
  user_id TEXT PRIMARY KEY,
  monthly_limit INTEGER NOT NULL DEFAULT 200,
  bonus_messages INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ DEFAULT date_trunc('month', NOW()),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message packs purchased: audit trail
CREATE TABLE IF NOT EXISTS usage_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  messages_count INTEGER NOT NULL,
  amount_usd NUMERIC(10,2) NOT NULL,
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_purchases_user
  ON usage_purchases (user_id, created_at);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function: Get user's message count for current month
CREATE OR REPLACE FUNCTION get_monthly_message_count(p_user_id TEXT)
RETURNS INTEGER AS $$
  SELECT COALESCE(COUNT(*)::INTEGER, 0)
  FROM usage_messages
  WHERE user_id = p_user_id
    AND created_at >= date_trunc('month', NOW());
$$ LANGUAGE sql STABLE;

-- Function: Get user's remaining messages
CREATE OR REPLACE FUNCTION get_remaining_messages(p_user_id TEXT)
RETURNS INTEGER AS $$
  SELECT 
    COALESCE(q.monthly_limit, 200) + COALESCE(q.bonus_messages, 0) 
    - COALESCE((
      SELECT COUNT(*)::INTEGER 
      FROM usage_messages 
      WHERE user_id = p_user_id 
        AND created_at >= date_trunc('month', NOW())
    ), 0)
  FROM usage_quotas q
  WHERE q.user_id = p_user_id
  UNION ALL
  -- Default if no quota row exists: 200 - count
  SELECT 200 - COALESCE((
    SELECT COUNT(*)::INTEGER 
    FROM usage_messages 
    WHERE user_id = p_user_id 
      AND created_at >= date_trunc('month', NOW())
  ), 0)
  WHERE NOT EXISTS (SELECT 1 FROM usage_quotas WHERE user_id = p_user_id)
  LIMIT 1;
$$ LANGUAGE sql STABLE;
