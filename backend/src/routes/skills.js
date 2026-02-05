/**
 * OpenClaw Skills API Routes
 * 
 * Endpoints for managing skills (knowledge files) for OpenClaw instances.
 * Skills are .md files that get injected into the bot's system prompt.
 * 
 * Routes:
 * - POST   /api/skills              - Upload a new skill
 * - GET    /api/skills              - List skills for an instance
 * - GET    /api/skills/:id          - Get skill details
 * - PUT    /api/skills/:id          - Update skill
 * - DELETE /api/skills/:id          - Delete skill
 * - POST   /api/skills/:id/toggle   - Toggle skill active/inactive
 * - GET    /api/skills/prompt/:instanceId - Get combined skills prompt
 */

import { Router } from 'express'
import { query } from '../db/connection.js'

const router = Router()

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_SKILLS_PER_INSTANCE = 20
const MAX_SKILL_SIZE = 50000  // 50k characters (~12k tokens)
const MAX_TOTAL_TOKENS = 50000  // Total tokens across all skills

// Simple token estimation (4 chars ≈ 1 token)
function estimateTokens(text) {
  return Math.ceil(text.length / 4)
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

function requireAuth(req, res, next) {
  const userId = req.headers['x-privy-id']
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    })
  }
  req.userId = userId
  next()
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/skills
 * Upload a new skill
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { instanceId, name, content, description, filename } = req.body
    const userId = req.userId

    // Validation
    if (!instanceId) {
      return res.status(400).json({ success: false, error: 'Instance ID required' })
    }
    if (!name || name.length < 1 || name.length > 100) {
      return res.status(400).json({ success: false, error: 'Name required (1-100 characters)' })
    }
    if (!content || content.length < 10) {
      return res.status(400).json({ success: false, error: 'Content required (min 10 characters)' })
    }
    if (content.length > MAX_SKILL_SIZE) {
      return res.status(400).json({ 
        success: false, 
        error: `Skill too large. Max ${MAX_SKILL_SIZE} characters (~${estimateTokens(MAX_SKILL_SIZE)} tokens)` 
      })
    }

    // Verify instance ownership
    const instanceResult = await query(
      'SELECT id FROM moltbot_instances WHERE id = $1 AND user_id = $2',
      [instanceId, userId]
    )
    if (instanceResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Instance not found' })
    }

    // Check skill limit
    const countResult = await query(
      'SELECT COUNT(*) FROM openclaw_skills WHERE instance_id = $1',
      [instanceId]
    )
    if (parseInt(countResult.rows[0].count) >= MAX_SKILLS_PER_INSTANCE) {
      return res.status(400).json({ 
        success: false, 
        error: `Maximum ${MAX_SKILLS_PER_INSTANCE} skills per instance` 
      })
    }

    // Check total tokens
    const tokensResult = await query(
      'SELECT COALESCE(SUM(content_tokens), 0) as total FROM openclaw_skills WHERE instance_id = $1 AND is_active = true',
      [instanceId]
    )
    const currentTokens = parseInt(tokensResult.rows[0].total)
    const newTokens = estimateTokens(content)
    
    if (currentTokens + newTokens > MAX_TOTAL_TOKENS) {
      return res.status(400).json({
        success: false,
        error: `Token limit exceeded. Current: ${currentTokens}, New: ${newTokens}, Max: ${MAX_TOTAL_TOKENS}`
      })
    }

    // Insert skill
    const result = await query(
      `INSERT INTO openclaw_skills (instance_id, user_id, name, description, filename, content, content_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [instanceId, userId, name, description || null, filename || `${name}.md`, content, newTokens]
    )

    res.status(201).json({
      success: true,
      skill: result.rows[0],
      message: `Skill "${name}" added! Your bot will now use this knowledge.`
    })

  } catch (error) {
    console.error('Create skill error:', error)
    res.status(500).json({ success: false, error: 'Failed to create skill' })
  }
})

/**
 * GET /api/skills
 * List skills for an instance
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { instanceId } = req.query
    const userId = req.userId

    if (!instanceId) {
      return res.status(400).json({ success: false, error: 'Instance ID required' })
    }

    // Verify instance ownership
    const instanceResult = await query(
      'SELECT id FROM moltbot_instances WHERE id = $1 AND user_id = $2',
      [instanceId, userId]
    )
    if (instanceResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Instance not found' })
    }

    const result = await query(
      `SELECT id, name, description, filename, content_tokens, is_active, created_at, updated_at
       FROM openclaw_skills 
       WHERE instance_id = $1
       ORDER BY created_at DESC`,
      [instanceId]
    )

    // Calculate totals
    const totalTokens = result.rows
      .filter(s => s.is_active)
      .reduce((sum, s) => sum + s.content_tokens, 0)

    res.json({
      success: true,
      skills: result.rows,
      stats: {
        total: result.rows.length,
        active: result.rows.filter(s => s.is_active).length,
        totalTokens,
        maxTokens: MAX_TOTAL_TOKENS,
        tokenUsage: Math.round((totalTokens / MAX_TOTAL_TOKENS) * 100)
      }
    })

  } catch (error) {
    console.error('List skills error:', error)
    res.status(500).json({ success: false, error: 'Failed to list skills' })
  }
})

/**
 * GET /api/skills/:id
 * Get skill details (including content)
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.userId

    const result = await query(
      `SELECT s.* FROM openclaw_skills s
       JOIN moltbot_instances i ON s.instance_id = i.id
       WHERE s.id = $1 AND i.user_id = $2`,
      [id, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Skill not found' })
    }

    res.json({
      success: true,
      skill: result.rows[0]
    })

  } catch (error) {
    console.error('Get skill error:', error)
    res.status(500).json({ success: false, error: 'Failed to get skill' })
  }
})

/**
 * PUT /api/skills/:id
 * Update skill
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const { name, content, description } = req.body
    const userId = req.userId

    // Verify ownership
    const existingResult = await query(
      `SELECT s.*, i.id as instance_id FROM openclaw_skills s
       JOIN moltbot_instances i ON s.instance_id = i.id
       WHERE s.id = $1 AND i.user_id = $2`,
      [id, userId]
    )

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Skill not found' })
    }

    const existing = existingResult.rows[0]
    const newContent = content || existing.content
    const newTokens = estimateTokens(newContent)

    // Check token limit if content changed
    if (content && content !== existing.content) {
      const tokensResult = await query(
        `SELECT COALESCE(SUM(content_tokens), 0) as total 
         FROM openclaw_skills 
         WHERE instance_id = $1 AND is_active = true AND id != $2`,
        [existing.instance_id, id]
      )
      const otherTokens = parseInt(tokensResult.rows[0].total)
      
      if (otherTokens + newTokens > MAX_TOTAL_TOKENS) {
        return res.status(400).json({
          success: false,
          error: `Token limit exceeded. Max: ${MAX_TOTAL_TOKENS}`
        })
      }
    }

    const result = await query(
      `UPDATE openclaw_skills 
       SET name = COALESCE($1, name),
           content = COALESCE($2, content),
           description = COALESCE($3, description),
           content_tokens = $4
       WHERE id = $5
       RETURNING *`,
      [name, content, description, newTokens, id]
    )

    res.json({
      success: true,
      skill: result.rows[0],
      message: 'Skill updated!'
    })

  } catch (error) {
    console.error('Update skill error:', error)
    res.status(500).json({ success: false, error: 'Failed to update skill' })
  }
})

/**
 * DELETE /api/skills/:id
 * Delete skill
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.userId

    const result = await query(
      `DELETE FROM openclaw_skills s
       USING moltbot_instances i
       WHERE s.instance_id = i.id AND s.id = $1 AND i.user_id = $2
       RETURNING s.name`,
      [id, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Skill not found' })
    }

    res.json({
      success: true,
      message: `Skill "${result.rows[0].name}" deleted`
    })

  } catch (error) {
    console.error('Delete skill error:', error)
    res.status(500).json({ success: false, error: 'Failed to delete skill' })
  }
})

/**
 * POST /api/skills/:id/toggle
 * Toggle skill active/inactive
 */
router.post('/:id/toggle', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.userId

    const result = await query(
      `UPDATE openclaw_skills s
       SET is_active = NOT is_active
       FROM moltbot_instances i
       WHERE s.instance_id = i.id AND s.id = $1 AND i.user_id = $2
       RETURNING s.*`,
      [id, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Skill not found' })
    }

    const skill = result.rows[0]
    res.json({
      success: true,
      skill,
      message: skill.is_active ? 'Skill enabled' : 'Skill disabled'
    })

  } catch (error) {
    console.error('Toggle skill error:', error)
    res.status(500).json({ success: false, error: 'Failed to toggle skill' })
  }
})

/**
 * GET /api/skills/prompt/:instanceId
 * Get combined skills prompt for injection
 * (Used internally when deploying or by the bot)
 */
router.get('/prompt/:instanceId', async (req, res) => {
  try {
    const { instanceId } = req.params

    const result = await query(
      `SELECT name, content FROM openclaw_skills 
       WHERE instance_id = $1 AND is_active = true
       ORDER BY created_at ASC`,
      [instanceId]
    )

    if (result.rows.length === 0) {
      return res.json({ success: true, prompt: '', skillCount: 0 })
    }

    // Build the combined prompt
    let prompt = '# KNOWLEDGE BASE\nUse the following information to answer questions:\n'
    
    for (const skill of result.rows) {
      prompt += `\n## ${skill.name}\n${skill.content}\n`
    }

    res.json({
      success: true,
      prompt,
      skillCount: result.rows.length,
      tokenEstimate: estimateTokens(prompt)
    })

  } catch (error) {
    console.error('Get prompt error:', error)
    res.status(500).json({ success: false, error: 'Failed to get skills prompt' })
  }
})

export default router
