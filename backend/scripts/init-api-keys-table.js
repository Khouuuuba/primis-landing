import { pool, testConnection } from '../src/db/connection.js'
import dotenv from 'dotenv'

dotenv.config()

async function initApiKeysTable() {
  console.log('🔐 Creating API Keys tables...\n')
  
  const connected = await testConnection()
  if (!connected) {
    console.error('❌ Cannot connect to database')
    process.exit(1)
  }
  
  try {
    // Create api_keys table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        prefix VARCHAR(12) NOT NULL UNIQUE,
        key_hash VARCHAR(64) NOT NULL,
        scopes TEXT[] NOT NULL DEFAULT ARRAY['read'],
        last_used_at TIMESTAMP WITH TIME ZONE,
        request_count INTEGER DEFAULT 0,
        rate_limit INTEGER DEFAULT 100,
        is_active BOOLEAN DEFAULT true,
        revoked_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE
      )
    `)
    console.log('✅ api_keys table created')

    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(prefix)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active) WHERE is_active = true`)
    console.log('✅ api_keys indexes created')

    // Create api_key_usage table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_key_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
        endpoint VARCHAR(255) NOT NULL,
        method VARCHAR(10) NOT NULL,
        status_code INTEGER,
        response_time_ms INTEGER,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)
    console.log('✅ api_key_usage table created')

    // Create usage indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_id ON api_key_usage(api_key_id)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_api_key_usage_created ON api_key_usage(created_at)`)
    console.log('✅ api_key_usage indexes created')

    // Create rate limits table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_rate_limits (
        api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
        window_start TIMESTAMP WITH TIME ZONE NOT NULL,
        request_count INTEGER DEFAULT 1,
        PRIMARY KEY (api_key_id, window_start)
      )
    `)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON api_rate_limits(window_start)`)
    console.log('✅ api_rate_limits table created')

    console.log('\n🎉 API Keys tables initialized successfully!')
    
  } catch (error) {
    console.error('❌ Failed to create tables:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

initApiKeysTable()
