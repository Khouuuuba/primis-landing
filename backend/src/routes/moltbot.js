/**
 * Moltbot API Routes
 * 
 * Endpoints for deploying and managing Moltbot instances on Railway.
 * 
 * Routes:
 * - POST   /api/moltbot/deploy          - Deploy new Moltbot instance
 * - GET    /api/moltbot/instances       - List user's instances
 * - GET    /api/moltbot/instances/:id   - Get instance details
 * - POST   /api/moltbot/instances/:id/restart  - Restart instance
 * - DELETE /api/moltbot/instances/:id   - Terminate instance
 * - GET    /api/moltbot/health          - Check Railway API health
 */

import { Router } from 'express'
import { query } from '../db/connection.js'
import { encrypt, decrypt, maskSecret } from '../utils/encryption.js'
import RailwayProvider from '../providers/railway.js'

const router = Router()

// =============================================================================
// CONSTANTS
// =============================================================================

const VALID_AI_PROVIDERS = ['anthropic', 'openai']
const VALID_CHANNELS = ['telegram', 'discord', 'whatsapp', 'slack']
const MAX_INSTANCES_PER_USER = 5

// Primis-provided API keys (users don't need their own)
const PRIMIS_API_KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY
}

// Daily message limit per instance
const DAILY_MESSAGE_LIMIT = 1000

const BOT_TOKEN_PATTERNS = {
  telegram: /^\d+:[A-Za-z0-9_-]+$/,
  discord: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Require authentication
 */
function requireAuth(req, res, next) {
  const userId = req.headers['x-privy-id']
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    })
  }
  req.userId = userId
  next()
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

function getPrimisApiKey(provider) {
  const key = PRIMIS_API_KEYS[provider]
  if (!key) {
    console.warn(`No Primis API key configured for provider: ${provider}`)
    return null
  }
  return key
}

function validateBotToken(channel, token) {
  const pattern = BOT_TOKEN_PATTERNS[channel]
  if (!pattern) return { valid: true }  // Unknown channels pass through
  if (!token) return { valid: false, error: `${channel} bot token is required` }
  if (!pattern.test(token)) return { valid: false, error: `Invalid ${channel} bot token format` }
  return { valid: true }
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/moltbot/deploy
 * Deploy a new Moltbot instance
 * 
 * Note: AI API keys are provided by Primis - users don't need their own
 */
router.post('/deploy', requireAuth, async (req, res) => {
  try {
    const { name, aiProvider, channels = {} } = req.body
    const userId = req.userId

    // Validation
    if (!name || typeof name !== 'string' || name.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Name is required (min 3 characters)',
        code: 'INVALID_NAME'
      })
    }

    if (!VALID_AI_PROVIDERS.includes(aiProvider)) {
      return res.status(400).json({
        success: false,
        error: `AI provider must be one of: ${VALID_AI_PROVIDERS.join(', ')}`,
        code: 'INVALID_PROVIDER'
      })
    }

    // Get Primis-provided API key
    const aiApiKey = getPrimisApiKey(aiProvider)
    if (!aiApiKey) {
      return res.status(503).json({
        success: false,
        error: `${aiProvider} is not available at this time. Please try another provider.`,
        code: 'PROVIDER_UNAVAILABLE'
      })
    }

    // Validate channel tokens
    const enabledChannels = []
    const channelSecrets = {}
    
    for (const [channel, config] of Object.entries(channels)) {
      if (!VALID_CHANNELS.includes(channel)) continue
      
      const tokenValidation = validateBotToken(channel, config?.botToken)
      if (!tokenValidation.valid) {
        return res.status(400).json({
          success: false,
          error: tokenValidation.error,
          code: 'INVALID_BOT_TOKEN'
        })
      }
      
      enabledChannels.push(channel)
      channelSecrets[channel] = config.botToken
    }

    if (enabledChannels.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one channel must be configured',
        code: 'NO_CHANNELS'
      })
    }

    // Check instance limit
    const existingCount = await query(
      `SELECT COUNT(*) FROM moltbot_instances 
       WHERE user_id = $1 AND status NOT IN ('terminated')`,
      [userId]
    )
    
    if (parseInt(existingCount.rows[0].count) >= MAX_INSTANCES_PER_USER) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${MAX_INSTANCES_PER_USER} instances allowed per user`,
        code: 'INSTANCE_LIMIT_REACHED'
      })
    }

    // Create database record
    const instanceResult = await query(
      `INSERT INTO moltbot_instances 
       (user_id, name, ai_provider, channels, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [userId, name, aiProvider, enabledChannels]
    )
    
    const instanceId = instanceResult.rows[0].id

    // Store encrypted secrets
    const aiKeySecret = encrypt(aiApiKey)
    await query(
      `INSERT INTO moltbot_secrets (instance_id, key_name, encrypted_value, iv, auth_tag)
       VALUES ($1, $2, $3, $4, $5)`,
      [instanceId, `${aiProvider.toUpperCase()}_API_KEY`, aiKeySecret.encryptedValue, aiKeySecret.iv, aiKeySecret.authTag]
    )

    for (const [channel, token] of Object.entries(channelSecrets)) {
      const tokenSecret = encrypt(token)
      const keyName = `${channel.toUpperCase()}_BOT_TOKEN`
      await query(
        `INSERT INTO moltbot_secrets (instance_id, key_name, encrypted_value, iv, auth_tag)
         VALUES ($1, $2, $3, $4, $5)`,
        [instanceId, keyName, tokenSecret.encryptedValue, tokenSecret.iv, tokenSecret.authTag]
      )
    }

    // Log deployment start
    await query(
      `INSERT INTO moltbot_deployment_logs (instance_id, event_type, message)
       VALUES ($1, 'deploy', 'Deployment initiated')`,
      [instanceId]
    )

    // Deploy to Railway (async - don't wait for completion)
    deployToRailway(instanceId, name, aiProvider, enabledChannels).catch(err => {
      console.error(`Railway deployment failed for ${instanceId}:`, err)
    })

    // Return immediately with pending status
    res.status(201).json({
      success: true,
      instance: {
        id: instanceId,
        name,
        status: 'pending',
        aiProvider,
        channels: enabledChannels,
        estimatedReadyTime: '5-10 minutes',
        createdAt: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Deploy error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to deploy Moltbot instance',
      code: 'DEPLOY_ERROR'
    })
  }
})

/**
 * Async function to deploy to Railway
 */
async function deployToRailway(instanceId, name, aiProvider, channels) {
  try {
    // Update status to deploying
    await query(
      `UPDATE moltbot_instances SET status = 'deploying' WHERE id = $1`,
      [instanceId]
    )

    // Get decrypted secrets
    const secretsResult = await query(
      `SELECT key_name, encrypted_value, iv, auth_tag FROM moltbot_secrets WHERE instance_id = $1`,
      [instanceId]
    )

    const envVars = {}
    for (const secret of secretsResult.rows) {
      const decrypted = decrypt(secret.encrypted_value, secret.iv, secret.auth_tag)
      envVars[secret.key_name] = decrypted
    }

    // Fetch skills for system prompt injection
    const skillsResult = await query(
      `SELECT name, content FROM openclaw_skills 
       WHERE instance_id = $1 AND is_active = true
       ORDER BY created_at ASC`,
      [instanceId]
    )

    if (skillsResult.rows.length > 0) {
      let skillsPrompt = 'KNOWLEDGE BASE - Use this information to answer questions:\n\n'
      for (const skill of skillsResult.rows) {
        skillsPrompt += `## ${skill.name}\n${skill.content}\n\n`
      }
      envVars.CLAWDBOT_SYSTEM_PROMPT = skillsPrompt
      console.log(`Injecting ${skillsResult.rows.length} skills into system prompt`)
    }

    // Add Brave API key for web search if available
    if (process.env.BRAVE_API_KEY) {
      envVars.BRAVE_API_KEY = process.env.BRAVE_API_KEY
      console.log('Injecting BRAVE_API_KEY for web search')
    }

    // Deploy to Railway
    const deployment = await RailwayProvider.deployMoltbot({
      name,
      envVars
    })

    // Update database with Railway IDs
    await query(
      `UPDATE moltbot_instances SET 
        railway_service_id = $1,
        railway_environment_id = $2,
        railway_project_id = $3,
        railway_url = $4,
        status = 'building',
        deployed_at = NOW()
       WHERE id = $5`,
      [
        deployment.serviceId,
        deployment.environmentId,
        deployment.projectId,
        deployment.domain,
        instanceId
      ]
    )

    // Log success
    await query(
      `INSERT INTO moltbot_deployment_logs (instance_id, event_type, message, metadata)
       VALUES ($1, 'deploy', 'Railway service created', $2)`,
      [instanceId, JSON.stringify({ serviceId: deployment.serviceId })]
    )

  } catch (error) {
    console.error(`Railway deployment error for ${instanceId}:`, error)
    
    // Update status to failed
    await query(
      `UPDATE moltbot_instances SET status = 'failed', error_message = $1 WHERE id = $2`,
      [error.message, instanceId]
    )

    // Log failure
    await query(
      `INSERT INTO moltbot_deployment_logs (instance_id, event_type, message, metadata)
       VALUES ($1, 'error', 'Deployment failed', $2)`,
      [instanceId, JSON.stringify({ error: error.message })]
    )
  }
}

/**
 * GET /api/moltbot/instances
 * List user's Moltbot instances
 * Syncs status from Railway for instances that are building/deploying
 */
router.get('/instances', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        id, name, status, ai_provider, channels, railway_url,
        railway_service_id, railway_environment_id,
        created_at, deployed_at, total_uptime_seconds, error_message,
        subscription_status, trial_ends_at
       FROM moltbot_instances 
       WHERE user_id = $1 AND status != 'terminated'
       ORDER BY created_at DESC`,
      [req.userId]
    )

    // Sync status from Railway for instances that might have changed
    const instances = await Promise.all(result.rows.map(async (row) => {
      let currentStatus = row.status
      
      // If instance is building/deploying, check Railway for actual status
      if (['building', 'deploying', 'pending'].includes(row.status) && row.railway_service_id) {
        try {
          const railwayStatus = await RailwayProvider.getServiceStatus(row.railway_service_id)
          if (railwayStatus && railwayStatus !== row.status) {
            // Update database with new status
            await query(
              `UPDATE moltbot_instances SET status = $1, deployed_at = CASE WHEN $1 = 'running' THEN NOW() ELSE deployed_at END WHERE id = $2`,
              [railwayStatus, row.id]
            )
            currentStatus = railwayStatus
          }
        } catch (err) {
          console.warn(`Failed to sync status for instance ${row.id}:`, err.message)
        }
      }
      
      return {
        id: row.id,
        name: row.name,
        status: currentStatus,
        aiProvider: row.ai_provider,
        channels: row.channels,
        url: row.railway_url,
        uptime: formatUptime(row.total_uptime_seconds),
        errorMessage: row.error_message,
        subscriptionStatus: row.subscription_status,
        trialEndsAt: row.trial_ends_at,
        createdAt: row.created_at,
        deployedAt: row.deployed_at
      }
    }))

    res.json({ instances })

  } catch (error) {
    console.error('List instances error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to list instances',
      code: 'LIST_ERROR'
    })
  }
})

/**
 * GET /api/moltbot/instances/:id
 * Get instance details
 */
router.get('/instances/:id', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM moltbot_instances WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Instance not found',
        code: 'NOT_FOUND'
      })
    }

    const row = result.rows[0]

    // Get deployment logs
    const logsResult = await query(
      `SELECT event_type, message, created_at FROM moltbot_deployment_logs 
       WHERE instance_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.params.id]
    )

    res.json({
      instance: {
        id: row.id,
        name: row.name,
        status: row.status,
        aiProvider: row.ai_provider,
        channels: row.channels,
        url: row.railway_url,
        uptime: formatUptime(row.total_uptime_seconds),
        errorMessage: row.error_message,
        subscriptionStatus: row.subscription_status,
        trialEndsAt: row.trial_ends_at,
        createdAt: row.created_at,
        deployedAt: row.deployed_at,
        railway: {
          serviceId: row.railway_service_id,
          environmentId: row.railway_environment_id,
          projectId: row.railway_project_id
        }
      },
      logs: logsResult.rows
    })

  } catch (error) {
    console.error('Get instance error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get instance',
      code: 'GET_ERROR'
    })
  }
})

/**
 * POST /api/moltbot/instances/:id/restart
 * Restart an instance
 */
router.post('/instances/:id/restart', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM moltbot_instances WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Instance not found',
        code: 'NOT_FOUND'
      })
    }

    const instance = result.rows[0]

    if (!instance.railway_service_id) {
      return res.status(400).json({
        success: false,
        error: 'Instance not yet deployed to Railway',
        code: 'NOT_DEPLOYED'
      })
    }

    // Fetch updated skills for system prompt
    const skillsResult = await query(
      `SELECT name, content FROM openclaw_skills 
       WHERE instance_id = $1 AND is_active = true
       ORDER BY created_at ASC`,
      [req.params.id]
    )

    // Build updated environment variables
    const updatedVars = {}
    if (skillsResult.rows.length > 0) {
      let skillsPrompt = 'KNOWLEDGE BASE - Use this information to answer questions:\n\n'
      for (const skill of skillsResult.rows) {
        skillsPrompt += `## ${skill.name}\n${skill.content}\n\n`
      }
      updatedVars.CLAWDBOT_SYSTEM_PROMPT = skillsPrompt
      console.log(`Restart: Injecting ${skillsResult.rows.length} skills into system prompt`)
    } else {
      // Clear system prompt if no skills
      updatedVars.CLAWDBOT_SYSTEM_PROMPT = ''
      console.log('Restart: No active skills, clearing system prompt')
    }

    // Add Brave API key for web search if available
    if (process.env.BRAVE_API_KEY) {
      updatedVars.BRAVE_API_KEY = process.env.BRAVE_API_KEY
      console.log('Restart: Injecting BRAVE_API_KEY for web search')
    }

    // Update Railway service environment variables
    await RailwayProvider.setServiceVariables({
      projectId: instance.railway_project_id,
      environmentId: instance.railway_environment_id,
      serviceId: instance.railway_service_id,
      variables: updatedVars
    })

    // Trigger redeploy
    await RailwayProvider.redeployService(
      instance.railway_service_id,
      instance.railway_environment_id
    )

    // Update status
    await query(
      `UPDATE moltbot_instances SET status = 'deploying' WHERE id = $1`,
      [req.params.id]
    )

    // Log restart with skill count
    await query(
      `INSERT INTO moltbot_deployment_logs (instance_id, event_type, message)
       VALUES ($1, 'restart', $2)`,
      [req.params.id, `Instance restart triggered with ${skillsResult.rows.length} skills`]
    )

    res.json({
      success: true,
      message: 'Instance restart triggered'
    })

  } catch (error) {
    console.error('Restart error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to restart instance',
      code: 'RESTART_ERROR'
    })
  }
})

/**
 * DELETE /api/moltbot/instances/:id
 * Terminate an instance
 */
router.delete('/instances/:id', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM moltbot_instances WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Instance not found',
        code: 'NOT_FOUND'
      })
    }

    const instance = result.rows[0]

    // Delete from Railway if deployed
    if (instance.railway_service_id) {
      try {
        await RailwayProvider.deleteService(instance.railway_service_id)
      } catch (railwayError) {
        console.error('Railway delete error:', railwayError)
        // Continue anyway - we still want to clean up our DB
      }
    }

    // Update status to terminated
    await query(
      `UPDATE moltbot_instances SET 
        status = 'terminated', 
        terminated_at = NOW()
       WHERE id = $1`,
      [req.params.id]
    )

    // Log termination
    await query(
      `INSERT INTO moltbot_deployment_logs (instance_id, event_type, message)
       VALUES ($1, 'terminate', 'Instance terminated')`,
      [req.params.id]
    )

    res.json({
      success: true,
      message: 'Instance terminated'
    })

  } catch (error) {
    console.error('Terminate error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to terminate instance',
      code: 'TERMINATE_ERROR'
    })
  }
})

/**
 * GET /api/moltbot/health
 * Check Railway API health
 */
router.get('/health', async (req, res) => {
  try {
    const health = await RailwayProvider.healthCheck()
    res.json(health)
  } catch (error) {
    res.json({
      status: 'unhealthy',
      provider: 'railway',
      error: error.message
    })
  }
})

/**
 * GET /api/moltbot/admin/instances
 * List ALL instances (admin debug endpoint)
 */
router.get('/admin/instances', async (req, res) => {
  const adminKey = req.headers['x-admin-key']
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  
  try {
    const result = await query(
      `SELECT 
        id, user_id, name, status, ai_provider, channels, railway_url,
        created_at, deployed_at, error_message, subscription_status
       FROM moltbot_instances 
       ORDER BY created_at DESC
       LIMIT 50`
    )
    
    res.json({
      total: result.rows.length,
      instances: result.rows.map(r => ({
        id: r.id,
        userId: r.user_id?.substring(0, 30) + '...',
        name: r.name,
        status: r.status,
        aiProvider: r.ai_provider,
        channels: r.channels,
        url: r.railway_url,
        createdAt: r.created_at,
        error: r.error_message
      }))
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// =============================================================================
// HELPERS
// =============================================================================

function formatUptime(seconds) {
  if (!seconds || seconds === 0) return '0s'
  
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`)
  
  return parts.join(' ')
}

export default router
