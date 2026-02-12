/**
 * Chat Proxy API Routes
 * 
 * Proxies chat messages to the same AI model used by deployed agents.
 * Loads the agent's system prompt + skills from the DB, calls Claude,
 * returns the response. Enables in-app chat without touching Railway instances.
 * 
 * Routes:
 * - POST /api/chat/send         — Send a message to an agent
 * - GET  /api/chat/agents       — List user's agents available for chat
 */

import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { query } from '../db/connection.js'

const router = Router()

// Anthropic client (uses the same Primis key as Moltbot)
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

// Use Opus for paying users (the premium model)
const DEFAULT_MODEL = process.env.CHAT_MODEL || 'claude-opus-4-20250514'

// Max conversation history to send (keep costs/latency low)
const MAX_HISTORY_MESSAGES = 20

// Default monthly message limit
const DEFAULT_MONTHLY_LIMIT = 200

// =============================================================================
// MIDDLEWARE
// =============================================================================

function requireAuth(req, res, next) {
  const userId = req.headers['x-privy-id']
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  req.userId = userId
  next()
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/chat/agents
 * List user's agents that are available for chat (running status)
 */
router.get('/agents', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, ai_provider, status, created_at
       FROM moltbot_instances
       WHERE user_id = $1 AND status NOT IN ('terminated')
       ORDER BY created_at DESC`,
      [req.userId]
    )

    res.json({
      agents: result.rows.map(r => ({
        id: r.id,
        name: r.name,
        aiProvider: r.ai_provider,
        status: r.status,
        createdAt: r.created_at,
      }))
    })
  } catch (error) {
    console.error('Chat agents error:', error)
    res.status(500).json({ error: 'Failed to fetch agents' })
  }
})

/**
 * POST /api/chat/send
 * Send a message to an agent and get a response
 * 
 * Body: { agentId, message, history: [{ role, content }] }
 * Returns: { reply, model }
 */
router.post('/send', requireAuth, async (req, res) => {
  try {
    const { agentId, message, history = [] } = req.body

    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' })
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' })
    }

    if (!anthropic) {
      return res.status(503).json({ error: 'AI provider not configured' })
    }

    // Verify the agent belongs to this user
    const instanceResult = await query(
      `SELECT id, name, ai_provider, status
       FROM moltbot_instances
       WHERE id = $1 AND user_id = $2`,
      [agentId, req.userId]
    )

    if (instanceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' })
    }

    const agent = instanceResult.rows[0]

    // Build system prompt from agent's skills
    let systemPrompt = `You are "${agent.name}", a personal AI assistant deployed on Primis Protocol. You are helpful, concise, and friendly. You use a conversational tone.`

    // Load active skills for this agent
    try {
      const skillsResult = await query(
        `SELECT name, content FROM openclaw_skills
         WHERE instance_id = $1 AND is_active = true
         ORDER BY name`,
        [agentId]
      )

      if (skillsResult.rows.length > 0) {
        const skillsText = skillsResult.rows
          .map(s => `## ${s.name}\n${s.content}`)
          .join('\n\n')
        systemPrompt += `\n\nYou have the following knowledge and skills:\n\n${skillsText}`
      }
    } catch {
      // Skills table might not exist yet, that's fine
    }

    // ---------------------------------------------------------------
    // QUOTA CHECK: Enforce monthly message limit before calling AI
    // ---------------------------------------------------------------
    let remaining = DEFAULT_MONTHLY_LIMIT
    try {
      const quotaResult = await query(
        `SELECT get_remaining_messages($1) as remaining`,
        [req.userId]
      )
      remaining = quotaResult.rows[0]?.remaining ?? DEFAULT_MONTHLY_LIMIT
    } catch (err) {
      console.warn('Quota check failed, allowing request:', err.message)
    }

    if (remaining <= 0) {
      return res.status(429).json({
        error: 'message_limit_reached',
        message: `You've used all your messages this month. Buy more to continue chatting.`,
        remaining: 0,
        buyUrl: `${process.env.AI_BUILDER_URL || 'https://primisprotocol.ai/aibuilder'}?tab=moltbot&buy=messages`
      })
    }

    // Trim conversation history to last N messages
    const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES)

    // Build messages array
    const messages = [
      ...trimmedHistory.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message.trim() },
    ]

    // Call Claude (Opus for paying users)
    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    })

    const reply = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    // ---------------------------------------------------------------
    // LOG MESSAGE: Track usage for billing
    // ---------------------------------------------------------------
    try {
      await query(
        `INSERT INTO usage_messages (user_id, instance_id, model, tokens_input, tokens_output)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          req.userId,
          agentId,
          DEFAULT_MODEL,
          response.usage?.input_tokens || 0,
          response.usage?.output_tokens || 0
        ]
      )
    } catch (err) {
      console.warn('Failed to log message usage:', err.message)
      // Non-fatal — don't block the response
    }

    res.json({
      reply,
      model: DEFAULT_MODEL,
      agentName: agent.name,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      remaining: remaining - 1,
    })

  } catch (error) {
    console.error('Chat send error:', error)

    if (error?.status === 429) {
      return res.status(429).json({ error: 'Rate limit reached. Please wait a moment.' })
    }

    res.status(500).json({ error: 'Failed to get response from agent' })
  }
})

// =============================================================================
// USAGE ENDPOINT
// =============================================================================

/**
 * GET /api/chat/usage
 * Get current user's message usage for this billing period
 * 
 * Returns: { used, limit, bonus, remaining, periodStart, periodEnd }
 */
router.get('/usage', requireAuth, async (req, res) => {
  try {
    // Get message count this month
    const countResult = await query(
      `SELECT get_monthly_message_count($1) as used`,
      [req.userId]
    )
    const used = countResult.rows[0]?.used || 0

    // Get quota (or defaults)
    const quotaResult = await query(
      `SELECT monthly_limit, bonus_messages, period_start
       FROM usage_quotas WHERE user_id = $1`,
      [req.userId]
    )
    
    const quota = quotaResult.rows[0] || {
      monthly_limit: DEFAULT_MONTHLY_LIMIT,
      bonus_messages: 0,
      period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    }

    const limit = quota.monthly_limit || DEFAULT_MONTHLY_LIMIT
    const bonus = quota.bonus_messages || 0
    const remaining = Math.max(0, limit + bonus - used)

    // Period end = start of next month
    const periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const periodEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)

    res.json({
      used,
      limit,
      bonus,
      remaining,
      total: limit + bonus,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    })
  } catch (error) {
    console.error('Usage endpoint error:', error)
    res.status(500).json({ error: 'Failed to fetch usage' })
  }
})

export default router
