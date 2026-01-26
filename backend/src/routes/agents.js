import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { pool } from '../db/connection.js';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase client for storage
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Multer config for file uploads (50MB max for agent code)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    // Allow ZIP files and common code files
    const allowedTypes = [
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream'
    ];
    const allowedExtensions = ['.zip', '.tar.gz', '.tgz'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.some(e => file.originalname.toLowerCase().endsWith(e))) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP and TAR.GZ files are allowed'), false);
    }
  }
});

const AGENT_CODE_BUCKET = 'agent-code';

// =============================================
// AGENT CRUD OPERATIONS
// =============================================

/**
 * GET /api/agents
 * List all agents for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id'];
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE privy_id = $1',
      [privyId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;

    // Get agents with run stats
    const result = await pool.query(`
      SELECT 
        a.*,
        COUNT(ar.id) FILTER (WHERE ar.started_at > NOW() - INTERVAL '24 hours') as runs_24h,
        COALESCE(SUM(ar.cost_usd) FILTER (WHERE ar.started_at > NOW() - INTERVAL '24 hours'), 0) as cost_24h
      FROM agents a
      LEFT JOIN agent_runs ar ON ar.agent_id = a.id
      WHERE a.user_id = $1
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `, [userId]);

    // Get summary stats
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'running') as running_count,
        COUNT(*) as total_count,
        COALESCE(SUM(total_cost_usd), 0) as total_cost,
        COALESCE(SUM(total_runs), 0) as total_runs
      FROM agents
      WHERE user_id = $1
    `, [userId]);

    res.json({
      agents: result.rows,
      summary: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

/**
 * GET /api/agents/templates
 * List available agent templates
 */
router.get('/templates', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM agent_templates
      WHERE is_active = true
      ORDER BY is_featured DESC, popularity DESC
    `);

    res.json({ templates: result.rows });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * GET /api/agents/:id
 * Get a specific agent with recent runs
 */
router.get('/:id', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id'];
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    // Get user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE privy_id = $1',
      [privyId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;

    // Get agent
    const agentResult = await pool.query(
      'SELECT * FROM agents WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Get recent runs
    const runsResult = await pool.query(`
      SELECT * FROM agent_runs
      WHERE agent_id = $1
      ORDER BY started_at DESC
      LIMIT 20
    `, [id]);

    // Get run stats
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_runs,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_runs,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_runs,
        AVG(duration_ms) as avg_duration_ms,
        SUM(cost_usd) as total_cost,
        SUM(tokens_total) as total_tokens
      FROM agent_runs
      WHERE agent_id = $1
    `, [id]);

    res.json({
      agent: agentResult.rows[0],
      recent_runs: runsResult.rows,
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
});

/**
 * POST /api/agents
 * Create a new agent
 */
router.post('/', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id'];
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const {
      name,
      description,
      framework = 'custom',
      runtime = 'python',
      entry_point = 'main.py',
      environment = {},
      gpu_type = 'NVIDIA RTX A4000',
      memory_gb = 8,
      timeout_seconds = 30,
      template_id = null
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Agent name is required' });
    }

    // Get user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE privy_id = $1',
      [privyId]
    );
    
    if (userResult.rows.length === 0) {
      // Auto-create user for demo
      const newUser = await pool.query(
        'INSERT INTO users (privy_id) VALUES ($1) RETURNING id',
        [privyId]
      );
      userResult.rows = newUser.rows;
    }
    
    const userId = userResult.rows[0].id;

    // If template_id provided, copy template settings
    let templateData = {};
    if (template_id) {
      const templateResult = await pool.query(
        'SELECT * FROM agent_templates WHERE id = $1',
        [template_id]
      );
      if (templateResult.rows.length > 0) {
        const template = templateResult.rows[0];
        templateData = {
          framework: template.framework,
          runtime: template.runtime,
          entry_point: template.entry_point,
          code_url: template.code_url,
          environment: { ...template.default_env, ...environment }
        };
        
        // Increment template popularity
        await pool.query(
          'UPDATE agent_templates SET popularity = popularity + 1 WHERE id = $1',
          [template_id]
        );
      }
    }

    // Create agent
    const result = await pool.query(`
      INSERT INTO agents (
        user_id, name, description, framework, runtime, entry_point,
        environment, gpu_type, memory_gb, timeout_seconds, code_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      userId,
      name,
      description,
      templateData.framework || framework,
      templateData.runtime || runtime,
      templateData.entry_point || entry_point,
      JSON.stringify(templateData.environment || environment),
      gpu_type,
      memory_gb,
      timeout_seconds,
      templateData.code_url || null
    ]);

    res.status(201).json({ agent: result.rows[0] });
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

/**
 * PUT /api/agents/:id
 * Update an agent
 */
router.put('/:id', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id'];
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const {
      name,
      description,
      framework,
      runtime,
      entry_point,
      environment,
      gpu_type,
      memory_gb,
      timeout_seconds,
      replicas,
      min_replicas,
      max_replicas
    } = req.body;

    // Get user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE privy_id = $1',
      [privyId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;

    // Verify ownership
    const agentCheck = await pool.query(
      'SELECT id, status FROM agents WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (agentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (framework !== undefined) {
      updates.push(`framework = $${paramIndex++}`);
      values.push(framework);
    }
    if (runtime !== undefined) {
      updates.push(`runtime = $${paramIndex++}`);
      values.push(runtime);
    }
    if (entry_point !== undefined) {
      updates.push(`entry_point = $${paramIndex++}`);
      values.push(entry_point);
    }
    if (environment !== undefined) {
      updates.push(`environment = $${paramIndex++}`);
      values.push(JSON.stringify(environment));
    }
    if (gpu_type !== undefined) {
      updates.push(`gpu_type = $${paramIndex++}`);
      values.push(gpu_type);
    }
    if (memory_gb !== undefined) {
      updates.push(`memory_gb = $${paramIndex++}`);
      values.push(memory_gb);
    }
    if (timeout_seconds !== undefined) {
      updates.push(`timeout_seconds = $${paramIndex++}`);
      values.push(timeout_seconds);
    }
    if (replicas !== undefined) {
      updates.push(`replicas = $${paramIndex++}`);
      values.push(replicas);
    }
    if (min_replicas !== undefined) {
      updates.push(`min_replicas = $${paramIndex++}`);
      values.push(min_replicas);
    }
    if (max_replicas !== undefined) {
      updates.push(`max_replicas = $${paramIndex++}`);
      values.push(max_replicas);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(`
      UPDATE agents
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    res.json({ agent: result.rows[0] });
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

/**
 * DELETE /api/agents/:id
 * Delete an agent
 */
router.delete('/:id', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id'];
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    // Get user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE privy_id = $1',
      [privyId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;

    // Verify ownership and get RunPod endpoint ID
    const agentResult = await pool.query(
      'SELECT id, runpod_endpoint_id, status FROM agents WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = agentResult.rows[0];

    // TODO: If running, stop RunPod endpoint first
    if (agent.runpod_endpoint_id && agent.status === 'running') {
      // Will implement in Sprint 3.1.4
      console.log('Would stop RunPod endpoint:', agent.runpod_endpoint_id);
    }

    // Delete agent (cascade deletes runs)
    await pool.query('DELETE FROM agents WHERE id = $1', [id]);

    res.json({ success: true, message: 'Agent deleted' });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// =============================================
// AGENT CODE UPLOAD
// =============================================

/**
 * POST /api/agents/:id/upload
 * Upload agent code (ZIP file)
 */
router.post('/:id/upload', upload.single('code'), async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id'];
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Storage not configured' });
    }

    // Get user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE privy_id = $1',
      [privyId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;

    // Verify ownership
    const agentResult = await pool.query(
      'SELECT id, name FROM agents WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Generate storage path
    const timestamp = Date.now();
    const filename = `${id}/${timestamp}_${req.file.originalname}`;
    
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(AGENT_CODE_BUCKET)
      .upload(filename, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true
      });

    if (error) {
      console.error('Supabase upload error:', error);
      return res.status(500).json({ error: 'Failed to upload file' });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(AGENT_CODE_BUCKET)
      .getPublicUrl(filename);

    const codeUrl = urlData.publicUrl;

    // Update agent with code URL
    await pool.query(
      "UPDATE agents SET code_url = $1, status = 'draft', status_message = 'Code uploaded. Ready to deploy.' WHERE id = $2",
      [codeUrl, id]
    );

    res.json({
      success: true,
      message: 'Code uploaded successfully',
      code_url: codeUrl,
      filename: req.file.originalname,
      size_bytes: req.file.size
    });
  } catch (error) {
    console.error('Error uploading code:', error);
    res.status(500).json({ error: 'Failed to upload code' });
  }
});

/**
 * POST /api/agents/:id/upload-from-repo
 * Set agent code from a Git repository URL
 */
router.post('/:id/upload-from-repo', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id'];
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const { repo_url, branch = 'main', entry_point } = req.body;

    if (!repo_url) {
      return res.status(400).json({ error: 'repo_url is required' });
    }

    // Validate URL format
    const githubRegex = /^https:\/\/github\.com\/[\w-]+\/[\w.-]+$/;
    const gitlabRegex = /^https:\/\/gitlab\.com\/[\w-]+\/[\w.-]+$/;
    
    if (!githubRegex.test(repo_url) && !gitlabRegex.test(repo_url)) {
      return res.status(400).json({ error: 'Invalid repository URL. Only GitHub and GitLab are supported.' });
    }

    // Get user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE privy_id = $1',
      [privyId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;

    // Verify ownership
    const agentResult = await pool.query(
      'SELECT id FROM agents WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Update agent with repo URL
    const updates = ['repo_url = $1', "status = 'draft'", "status_message = 'Repository linked. Ready to deploy.'"];
    const values = [repo_url];
    
    if (entry_point) {
      updates.push(`entry_point = $${values.length + 1}`);
      values.push(entry_point);
    }

    values.push(id);
    await pool.query(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = $${values.length}`,
      values
    );

    res.json({
      success: true,
      message: 'Repository linked successfully',
      repo_url,
      branch
    });
  } catch (error) {
    console.error('Error linking repo:', error);
    res.status(500).json({ error: 'Failed to link repository' });
  }
});

// =============================================
// AGENT LIFECYCLE OPERATIONS
// =============================================

/**
 * POST /api/agents/:id/deploy
 * Deploy agent to RunPod (creates serverless endpoint)
 */
router.post('/:id/deploy', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id'];
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    // Get user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE privy_id = $1',
      [privyId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;

    // Get agent
    const agentResult = await pool.query(
      'SELECT * FROM agents WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = agentResult.rows[0];

    // Check if code is uploaded
    if (!agent.code_url && !agent.repo_url) {
      return res.status(400).json({ error: 'Agent code not uploaded. Please upload code first.' });
    }

    // Update status to deploying
    await pool.query(
      "UPDATE agents SET status = 'deploying', status_message = 'Creating RunPod endpoint...' WHERE id = $1",
      [id]
    );

    // TODO: Implement RunPod deployment in Sprint 3.1.4
    // For now, simulate deployment
    setTimeout(async () => {
      try {
        await pool.query(`
          UPDATE agents 
          SET status = 'running', 
              status_message = 'Agent deployed and ready',
              deployed_at = NOW(),
              runpod_endpoint_id = $2
          WHERE id = $1
        `, [id, `sim_${id.substring(0, 8)}`]);
      } catch (err) {
        console.error('Error updating agent status:', err);
      }
    }, 3000);

    res.json({ 
      success: true, 
      message: 'Deployment started',
      agent: { ...agent, status: 'deploying' }
    });
  } catch (error) {
    console.error('Error deploying agent:', error);
    res.status(500).json({ error: 'Failed to deploy agent' });
  }
});

/**
 * POST /api/agents/:id/start
 * Start a stopped agent
 */
router.post('/:id/start', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id'];
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    // Get user and agent
    const userResult = await pool.query(
      'SELECT id FROM users WHERE privy_id = $1',
      [privyId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;

    const agentResult = await pool.query(
      'SELECT * FROM agents WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = agentResult.rows[0];

    if (agent.status === 'running') {
      return res.status(400).json({ error: 'Agent is already running' });
    }

    // TODO: Start RunPod endpoint in Sprint 3.1.4
    await pool.query(
      "UPDATE agents SET status = 'running', status_message = 'Agent started' WHERE id = $1",
      [id]
    );

    res.json({ success: true, message: 'Agent started' });
  } catch (error) {
    console.error('Error starting agent:', error);
    res.status(500).json({ error: 'Failed to start agent' });
  }
});

/**
 * POST /api/agents/:id/stop
 * Stop a running agent
 */
router.post('/:id/stop', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id'];
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    // Get user and agent
    const userResult = await pool.query(
      'SELECT id FROM users WHERE privy_id = $1',
      [privyId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;

    const agentResult = await pool.query(
      'SELECT * FROM agents WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = agentResult.rows[0];

    if (agent.status !== 'running') {
      return res.status(400).json({ error: 'Agent is not running' });
    }

    // TODO: Stop RunPod endpoint in Sprint 3.1.4
    await pool.query(
      "UPDATE agents SET status = 'stopped', status_message = 'Agent stopped by user' WHERE id = $1",
      [id]
    );

    res.json({ success: true, message: 'Agent stopped' });
  } catch (error) {
    console.error('Error stopping agent:', error);
    res.status(500).json({ error: 'Failed to stop agent' });
  }
});

/**
 * POST /api/agents/:id/invoke
 * Invoke an agent (run it with input)
 * 
 * Modes:
 * - sync: true (default) - Wait for completion and return result
 * - sync: false - Return run_id immediately, client polls for result
 * - webhook_url: URL to POST results when complete (for async)
 */
router.post('/:id/invoke', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id'];
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const { 
      input, 
      sync = true, 
      timeout = 30,
      webhook_url = null 
    } = req.body;

    // Get user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE privy_id = $1',
      [privyId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;

    // Get agent
    const agentResult = await pool.query(
      'SELECT * FROM agents WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = agentResult.rows[0];

    if (agent.status !== 'running') {
      return res.status(400).json({ error: 'Agent is not running. Deploy or start it first.' });
    }

    // Create run record
    const runResult = await pool.query(`
      INSERT INTO agent_runs (agent_id, user_id, input, status, trigger_type)
      VALUES ($1, $2, $3, 'running', 'api')
      RETURNING *
    `, [id, userId, JSON.stringify(input)]);

    const run = runResult.rows[0];
    const startTime = Date.now();

    // Simulate agent processing (will be replaced with real RunPod call)
    const processAgent = async () => {
      // Simulate processing time (1-3 seconds)
      const processingTime = 1000 + Math.random() * 2000;
      await new Promise(resolve => setTimeout(resolve, processingTime));

      const duration = Date.now() - startTime;
      const tokensUsed = 100 + Math.floor(Math.random() * 200);
      const cost = tokensUsed * 0.000002; // $0.002 per 1K tokens

      // Simulate agent response based on input
      const simulatedOutput = {
        response: generateAgentResponse(agent, input),
        agent_name: agent.name,
        framework: agent.framework,
        steps: [
          { type: 'thought', content: 'Analyzing the input...' },
          { type: 'action', content: 'Processing request' },
          { type: 'observation', content: 'Generated response' }
        ],
        metadata: {
          model: 'gpt-4-turbo',
          tokens_input: Math.floor(tokensUsed * 0.3),
          tokens_output: Math.floor(tokensUsed * 0.7),
          processing_time_ms: duration
        }
      };

      // Update run record
      await pool.query(`
        UPDATE agent_runs 
        SET status = 'completed',
            output = $2,
            steps = $3,
            duration_ms = $4,
            tokens_input = $5,
            tokens_output = $6,
            tokens_total = $7,
            cost_usd = $8,
            completed_at = NOW()
        WHERE id = $1
      `, [
        run.id, 
        JSON.stringify(simulatedOutput),
        JSON.stringify(simulatedOutput.steps),
        duration, 
        simulatedOutput.metadata.tokens_input,
        simulatedOutput.metadata.tokens_output,
        tokensUsed, 
        cost
      ]);

      // Update agent stats
      await pool.query(`
        UPDATE agents 
        SET total_runs = total_runs + 1,
            total_tokens = total_tokens + $2,
            total_cost_usd = total_cost_usd + $3,
            last_run_at = NOW()
        WHERE id = $1
      `, [id, tokensUsed, cost]);

      // If webhook_url provided, POST the result
      if (webhook_url) {
        try {
          await fetch(webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              run_id: run.id,
              agent_id: id,
              status: 'completed',
              output: simulatedOutput,
              duration_ms: duration,
              cost_usd: cost
            })
          });
        } catch (webhookErr) {
          console.error('Webhook delivery failed:', webhookErr);
        }
      }

      return {
        run_id: run.id,
        status: 'completed',
        output: simulatedOutput,
        duration_ms: duration,
        tokens_used: tokensUsed,
        cost_usd: cost
      };
    };

    // Sync mode: wait for completion
    if (sync) {
      try {
        const result = await Promise.race([
          processAgent(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), timeout * 1000)
          )
        ]);
        
        res.json(result);
      } catch (timeoutErr) {
        // Update run as timed out
        await pool.query(
          "UPDATE agent_runs SET status = 'timeout', error_message = 'Request timed out' WHERE id = $1",
          [run.id]
        );
        res.status(408).json({ 
          error: 'Request timed out', 
          run_id: run.id,
          message: 'The agent took too long to respond. Check the run status later.'
        });
      }
    } else {
      // Async mode: return immediately, process in background
      processAgent().catch(err => {
        console.error('Async agent processing error:', err);
        pool.query(
          "UPDATE agent_runs SET status = 'failed', error_message = $2 WHERE id = $1",
          [run.id, err.message]
        );
      });

      res.json({
        run_id: run.id,
        status: 'running',
        message: 'Agent invoked asynchronously',
        poll_url: `/api/agents/${id}/runs/${run.id}`,
        webhook_url: webhook_url || null
      });
    }
  } catch (error) {
    console.error('Error invoking agent:', error);
    res.status(500).json({ error: 'Failed to invoke agent' });
  }
});

/**
 * POST /api/agents/webhook/:agentId
 * Public webhook endpoint for triggering agents
 * No auth required - uses webhook_token for verification
 */
router.post('/webhook/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { input, webhook_token } = req.body;

    // Get agent (no user auth required, but verify webhook token)
    const agentResult = await pool.query(
      'SELECT * FROM agents WHERE id = $1',
      [agentId]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = agentResult.rows[0];

    // Verify webhook token if set
    if (agent.webhook_token && agent.webhook_token !== webhook_token) {
      return res.status(401).json({ error: 'Invalid webhook token' });
    }

    if (agent.status !== 'running') {
      return res.status(400).json({ error: 'Agent is not running' });
    }

    // Create run record
    const runResult = await pool.query(`
      INSERT INTO agent_runs (agent_id, user_id, input, status, trigger_type)
      VALUES ($1, $2, $3, 'running', 'webhook')
      RETURNING *
    `, [agentId, agent.user_id, JSON.stringify(input)]);

    const run = runResult.rows[0];
    const startTime = Date.now();

    // Process asynchronously (webhook invocations are always async)
    (async () => {
      try {
        const processingTime = 1000 + Math.random() * 2000;
        await new Promise(resolve => setTimeout(resolve, processingTime));

        const duration = Date.now() - startTime;
        const tokensUsed = 100 + Math.floor(Math.random() * 200);
        const cost = tokensUsed * 0.000002;

        const simulatedOutput = {
          response: generateAgentResponse(agent, input),
          agent_name: agent.name,
          framework: agent.framework,
          trigger: 'webhook',
          metadata: {
            tokens_total: tokensUsed,
            processing_time_ms: duration
          }
        };

        await pool.query(`
          UPDATE agent_runs 
          SET status = 'completed',
              output = $2,
              duration_ms = $3,
              tokens_total = $4,
              cost_usd = $5,
              completed_at = NOW()
          WHERE id = $1
        `, [run.id, JSON.stringify(simulatedOutput), duration, tokensUsed, cost]);

        await pool.query(`
          UPDATE agents 
          SET total_runs = total_runs + 1,
              total_tokens = total_tokens + $2,
              total_cost_usd = total_cost_usd + $3,
              last_run_at = NOW()
          WHERE id = $1
        `, [agentId, tokensUsed, cost]);
      } catch (err) {
        console.error('Webhook processing error:', err);
        await pool.query(
          "UPDATE agent_runs SET status = 'failed', error_message = $2 WHERE id = $1",
          [run.id, err.message]
        );
      }
    })();

    res.json({
      success: true,
      run_id: run.id,
      status: 'running',
      message: 'Webhook received, agent invoked'
    });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/agents/:id/generate-webhook
 * Generate a unique webhook URL and token for an agent
 */
router.post('/:id/generate-webhook', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id'];
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    // Get user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE privy_id = $1',
      [privyId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;

    // Verify ownership
    const agentResult = await pool.query(
      'SELECT id FROM agents WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Generate webhook token
    const webhookToken = `whk_${Buffer.from(crypto.randomUUID()).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 32)}`;

    // Save to database
    await pool.query(
      'UPDATE agents SET webhook_token = $1 WHERE id = $2',
      [webhookToken, id]
    );

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
    const webhookUrl = `${baseUrl}/api/agents/webhook/${id}`;

    res.json({
      webhook_url: webhookUrl,
      webhook_token: webhookToken,
      example: {
        curl: `curl -X POST ${webhookUrl} -H "Content-Type: application/json" -d '{"input": "your message", "webhook_token": "${webhookToken}"}'`
      }
    });
  } catch (error) {
    console.error('Error generating webhook:', error);
    res.status(500).json({ error: 'Failed to generate webhook' });
  }
});

// Helper function to generate simulated agent responses
function generateAgentResponse(agent, input) {
  const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
  const responses = {
    langchain: `I've analyzed your request using LangChain. Based on my reasoning: "${inputStr.substring(0, 50)}..." - I've processed this through my chain of thought and here's my response.`,
    crewai: `The CrewAI team has collaborated on your request. Our agents worked together to process: "${inputStr.substring(0, 50)}..." - Task completed successfully.`,
    autogen: `AutoGen multi-agent conversation completed. After deliberation on "${inputStr.substring(0, 50)}..." - The agents have reached a consensus response.`,
    eliza: `*processes your message* I understand you're asking about "${inputStr.substring(0, 50)}..." - Let me help you with that.`,
    custom: `Agent "${agent.name}" has processed your request: "${inputStr.substring(0, 50)}..." - Here is the result.`,
    langgraph: `Graph execution complete. Traversed nodes to process: "${inputStr.substring(0, 50)}..." - Final state reached.`
  };
  return responses[agent.framework] || responses.custom;
}

/**
 * GET /api/agents/:id/runs
 * Get agent run history
 */
router.get('/:id/runs', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id'];
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Get user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE privy_id = $1',
      [privyId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;

    // Verify ownership
    const agentCheck = await pool.query(
      'SELECT id FROM agents WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (agentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Get runs
    const result = await pool.query(`
      SELECT * FROM agent_runs
      WHERE agent_id = $1
      ORDER BY started_at DESC
      LIMIT $2 OFFSET $3
    `, [id, limit, offset]);

    res.json({ runs: result.rows });
  } catch (error) {
    console.error('Error fetching runs:', error);
    res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

/**
 * GET /api/agents/:id/runs/:runId
 * Get a specific run
 */
router.get('/:id/runs/:runId', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id'];
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id, runId } = req.params;

    // Get user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE privy_id = $1',
      [privyId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;

    // Get run (verify ownership via agent)
    const result = await pool.query(`
      SELECT ar.* FROM agent_runs ar
      JOIN agents a ON ar.agent_id = a.id
      WHERE ar.id = $1 AND ar.agent_id = $2 AND a.user_id = $3
    `, [runId, id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Run not found' });
    }

    res.json({ run: result.rows[0] });
  } catch (error) {
    console.error('Error fetching run:', error);
    res.status(500).json({ error: 'Failed to fetch run' });
  }
});

export default router;
