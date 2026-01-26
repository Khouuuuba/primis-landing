import express from 'express';
import crypto from 'crypto';
import { query } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// =============================================
// UTILITY FUNCTIONS
// =============================================

/**
 * Generate a secure API key
 * Format: prmis_[32 random chars]
 * Returns: { fullKey, prefix, hash }
 */
function generateApiKey() {
  const randomBytes = crypto.randomBytes(24);
  const keyBody = randomBytes.toString('base64url'); // 32 chars
  const fullKey = `prmis_${keyBody}`;
  const prefix = fullKey.substring(0, 12); // "prmis_abc123"
  const hash = crypto.createHash('sha256').update(fullKey).digest('hex');
  
  return { fullKey, prefix, hash };
}

/**
 * Hash an API key for comparison
 */
function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Validate scopes array
 */
function validateScopes(scopes) {
  const validScopes = ['read', 'write', 'admin'];
  if (!Array.isArray(scopes)) return ['read'];
  return scopes.filter(s => validScopes.includes(s));
}

// =============================================
// ROUTES
// =============================================

/**
 * GET /api/api-keys
 * List all API keys for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        id,
        name,
        prefix,
        scopes,
        last_used_at,
        request_count,
        rate_limit,
        is_active,
        created_at,
        expires_at
      FROM api_keys
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [req.userId]);

    res.json({
      success: true,
      keys: result.rows
    });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch API keys' });
  }
});

/**
 * POST /api/api-keys
 * Create a new API key
 * Body: { name, scopes?, expiresIn? }
 */
router.post('/', async (req, res) => {
  const { name, scopes = ['read'], expiresIn } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Key name is required' });
  }

  if (name.length > 100) {
    return res.status(400).json({ success: false, error: 'Key name must be under 100 characters' });
  }

  try {
    // Check key limit (max 10 per user)
    const countResult = await query(
      'SELECT COUNT(*) FROM api_keys WHERE user_id = $1 AND is_active = true',
      [req.userId]
    );
    
    if (parseInt(countResult.rows[0].count) >= 10) {
      return res.status(400).json({ 
        success: false, 
        error: 'Maximum 10 active API keys allowed. Revoke an existing key to create a new one.' 
      });
    }

    // Generate the key
    const { fullKey, prefix, hash } = generateApiKey();
    const validScopes = validateScopes(scopes);
    
    // Calculate expiration
    let expiresAt = null;
    if (expiresIn) {
      const days = parseInt(expiresIn);
      if (days > 0 && days <= 365) {
        expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      }
    }

    // Insert into database
    const result = await query(`
      INSERT INTO api_keys (user_id, name, prefix, key_hash, scopes, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, prefix, scopes, created_at, expires_at
    `, [req.userId, name.trim(), prefix, hash, validScopes, expiresAt]);

    // Return the full key ONCE - it won't be shown again
    res.json({
      success: true,
      key: {
        ...result.rows[0],
        // IMPORTANT: This is the ONLY time the full key is returned
        fullKey: fullKey,
        warning: 'Save this key now. It will not be shown again.'
      }
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ success: false, error: 'Failed to create API key' });
  }
});

/**
 * PATCH /api/api-keys/:id
 * Update an API key (name, scopes)
 */
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, scopes } = req.body;

  try {
    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      if (name.trim().length === 0 || name.length > 100) {
        return res.status(400).json({ success: false, error: 'Invalid key name' });
      }
      updates.push(`name = $${paramCount++}`);
      values.push(name.trim());
    }

    if (scopes !== undefined) {
      updates.push(`scopes = $${paramCount++}`);
      values.push(validateScopes(scopes));
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    // Add WHERE conditions
    values.push(id, req.userId);
    
    const result = await query(`
      UPDATE api_keys
      SET ${updates.join(', ')}
      WHERE id = $${paramCount++} AND user_id = $${paramCount}
      RETURNING id, name, prefix, scopes, is_active, created_at
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'API key not found' });
    }

    res.json({ success: true, key: result.rows[0] });
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ success: false, error: 'Failed to update API key' });
  }
});

/**
 * DELETE /api/api-keys/:id
 * Revoke an API key (soft delete)
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await query(`
      UPDATE api_keys
      SET is_active = false, revoked_at = NOW()
      WHERE id = $1 AND user_id = $2 AND is_active = true
      RETURNING id, prefix
    `, [id, req.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'API key not found or already revoked' });
    }

    res.json({
      success: true,
      message: `API key ${result.rows[0].prefix}... has been revoked`
    });
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({ success: false, error: 'Failed to revoke API key' });
  }
});

/**
 * GET /api/api-keys/:id/usage
 * Get usage statistics for an API key
 */
router.get('/:id/usage', async (req, res) => {
  const { id } = req.params;
  const { days = 7 } = req.query;

  try {
    // Verify ownership
    const keyResult = await query(
      'SELECT id FROM api_keys WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );

    if (keyResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'API key not found' });
    }

    // Get usage stats
    const usageResult = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as requests,
        AVG(response_time_ms)::INTEGER as avg_response_time,
        COUNT(*) FILTER (WHERE status_code >= 400) as errors
      FROM api_key_usage
      WHERE api_key_id = $1 AND created_at > NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, [id]);

    // Get total stats
    const totalResult = await query(`
      SELECT 
        COUNT(*) as total_requests,
        AVG(response_time_ms)::INTEGER as avg_response_time,
        COUNT(*) FILTER (WHERE status_code >= 400) as total_errors
      FROM api_key_usage
      WHERE api_key_id = $1
    `, [id]);

    res.json({
      success: true,
      usage: {
        daily: usageResult.rows,
        totals: totalResult.rows[0]
      }
    });
  } catch (error) {
    console.error('Error fetching API key usage:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch usage data' });
  }
});

export default router;
export { hashApiKey };
