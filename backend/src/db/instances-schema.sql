-- =============================================
-- INSTANCES SCHEMA
-- GPU instance provisioning and management
-- =============================================

-- GPU Instances Table
-- Tracks all provisioned GPU instances
CREATE TABLE IF NOT EXISTS instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  
  -- RunPod identifiers
  runpod_pod_id VARCHAR(255),
  runpod_machine_id VARCHAR(255),
  
  -- Instance configuration
  gpu_type VARCHAR(100) NOT NULL,           -- e.g., 'RTX 4090', 'A100 80GB'
  gpu_count INTEGER NOT NULL DEFAULT 1,
  vcpu_count INTEGER,
  memory_gb INTEGER,
  storage_gb INTEGER,
  
  -- Pricing
  cost_per_hour DECIMAL(10, 4) NOT NULL,    -- USD per hour
  
  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, starting, running, stopping, stopped, terminated, error
  status_message TEXT,
  
  -- Timing
  requested_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  stopped_at TIMESTAMP,
  terminated_at TIMESTAMP,
  
  -- Connection info (populated when running)
  ssh_host VARCHAR(255),
  ssh_port INTEGER,
  jupyter_url VARCHAR(500),
  api_url VARCHAR(500),
  
  -- Cost tracking
  total_runtime_seconds INTEGER DEFAULT 0,
  total_cost_usd DECIMAL(12, 4) DEFAULT 0,
  
  -- Metadata
  name VARCHAR(255),
  template_id VARCHAR(100),                 -- Docker template used
  environment JSONB,                        -- Environment variables
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Instance Events Table
-- Audit log of all instance state changes
CREATE TABLE IF NOT EXISTS instance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  
  event_type VARCHAR(50) NOT NULL,          -- created, started, stopped, terminated, error, cost_update
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  
  details JSONB,                            -- Additional event data
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Instance Usage Table
-- Tracks usage periods for billing
CREATE TABLE IF NOT EXISTS instance_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP,
  
  runtime_seconds INTEGER,
  cost_usd DECIMAL(12, 4),
  
  billed BOOLEAN DEFAULT FALSE,
  billed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_instances_user_id ON instances(user_id);
CREATE INDEX IF NOT EXISTS idx_instances_status ON instances(status);
CREATE INDEX IF NOT EXISTS idx_instances_runpod_pod_id ON instances(runpod_pod_id);
CREATE INDEX IF NOT EXISTS idx_instance_events_instance_id ON instance_events(instance_id);
CREATE INDEX IF NOT EXISTS idx_instance_usage_instance_id ON instance_usage(instance_id);
CREATE INDEX IF NOT EXISTS idx_instance_usage_user_id ON instance_usage(user_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_instances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS instances_updated_at ON instances;
CREATE TRIGGER instances_updated_at
  BEFORE UPDATE ON instances
  FOR EACH ROW
  EXECUTE FUNCTION update_instances_updated_at();

-- =============================================
-- VIEWS
-- =============================================

-- Active instances view
CREATE OR REPLACE VIEW active_instances AS
SELECT 
  i.*,
  u.email as user_email,
  EXTRACT(EPOCH FROM (NOW() - i.started_at))::INTEGER as current_runtime_seconds,
  ROUND((EXTRACT(EPOCH FROM (NOW() - i.started_at)) / 3600 * i.cost_per_hour)::NUMERIC, 4) as current_session_cost
FROM instances i
JOIN users u ON i.user_id = u.id
WHERE i.status IN ('running', 'starting');

-- User instance summary view
CREATE OR REPLACE VIEW user_instance_summary AS
SELECT 
  user_id,
  COUNT(*) FILTER (WHERE status = 'running') as running_count,
  COUNT(*) FILTER (WHERE status IN ('pending', 'starting')) as starting_count,
  COUNT(*) as total_count,
  SUM(total_cost_usd) as total_spent_usd,
  SUM(total_runtime_seconds) as total_runtime_seconds
FROM instances
GROUP BY user_id;
