import express from 'express'
import { query } from '../db/connection.js'
import { 
  generateText, 
  estimateTokens, 
  calculateTextCost, 
  transcribeAudio, 
  calculateAudioCost,
  ENDPOINTS, 
  MODEL_PRICING 
} from '../runpod-serverless.js'

const router = express.Router()

/**
 * GET /api/inference/models
 * Get available models and their pricing
 */
router.get('/models', async (req, res) => {
  try {
    const models = Object.entries(MODEL_PRICING).map(([id, pricing]) => ({
      id,
      pricing: pricing.price,
      unit: pricing.unit,
      available: !!ENDPOINTS[id]
    }))

    res.json({ models })
  } catch (error) {
    console.error('Error fetching models:', error)
    res.status(500).json({ error: 'Failed to fetch models' })
  }
})

/**
 * POST /api/inference/text/estimate
 * Estimate cost for text generation
 */
router.post('/text/estimate', async (req, res) => {
  try {
    const { prompt, maxTokens = 512, model = 'llama-3-8b' } = req.body

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' })
    }

    const inputTokens = estimateTokens(prompt)
    const estimatedOutputTokens = Math.min(maxTokens, 512) // Assume max output
    const estimatedCost = calculateTextCost(inputTokens, estimatedOutputTokens, model)

    res.json({
      inputTokens,
      estimatedOutputTokens,
      totalTokens: inputTokens + estimatedOutputTokens,
      estimatedCost: parseFloat(estimatedCost.toFixed(6)),
      model,
      available: !!ENDPOINTS[model]
    })
  } catch (error) {
    console.error('Error estimating text cost:', error)
    res.status(500).json({ error: 'Failed to estimate cost' })
  }
})

/**
 * POST /api/inference/text/generate
 * Generate text using Llama
 */
router.post('/text/generate', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id']
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { prompt, model = 'llama-3-8b', maxTokens = 512, temperature = 0.7, systemPrompt } = req.body

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' })
    }

    // Check if endpoint is configured
    if (!ENDPOINTS[model]) {
      return res.status(400).json({ error: `${model} endpoint not configured` })
    }

    // Get user credits
    const creditResult = await query(
      'SELECT balance_usd FROM credits WHERE privy_id = $1',
      [privyId]
    )
    
    const balance = creditResult.rows[0]?.balance_usd || 0

    // Estimate cost
    const inputTokens = estimateTokens(prompt)
    const estimatedOutputTokens = maxTokens
    const estimatedCost = calculateTextCost(inputTokens, estimatedOutputTokens, model)

    if (balance < estimatedCost) {
      return res.status(400).json({ 
        error: 'Insufficient credits',
        required: estimatedCost,
        balance
      })
    }

    // Generate text
    const startTime = Date.now()
    const result = await generateText({
      prompt,
      model,
      maxTokens,
      temperature,
      systemPrompt
    })
    const duration = Date.now() - startTime

    // Calculate actual cost based on output
    const outputText = result.output?.text || result.output || ''
    const actualOutputTokens = estimateTokens(outputText)
    const actualCost = calculateTextCost(inputTokens, actualOutputTokens, model)

    // Deduct credits
    await query(
      'UPDATE credits SET balance_usd = balance_usd - $1 WHERE privy_id = $2',
      [actualCost, privyId]
    )

    // Get updated balance
    const newBalanceResult = await query(
      'SELECT balance_usd FROM credits WHERE privy_id = $1',
      [privyId]
    )
    const newBalance = newBalanceResult.rows[0]?.balance_usd || 0

    // Log usage
    await query(`
      INSERT INTO usage_logs (privy_id, service, model, input_tokens, output_tokens, cost, duration_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [privyId, 'text-generation', model, inputTokens, actualOutputTokens, actualCost, duration])

    res.json({
      success: true,
      output: outputText,
      usage: {
        inputTokens,
        outputTokens: actualOutputTokens,
        totalTokens: inputTokens + actualOutputTokens,
        cost: actualCost
      },
      durationMs: duration,
      newBalance
    })
  } catch (error) {
    console.error('Error generating text:', error)
    res.status(500).json({ error: error.message || 'Failed to generate text' })
  }
})

/**
 * POST /api/inference/audio/estimate
 * Estimate cost for audio transcription
 */
router.post('/audio/estimate', async (req, res) => {
  try {
    const { durationSeconds } = req.body

    if (!durationSeconds || durationSeconds <= 0) {
      return res.status(400).json({ error: 'Duration is required' })
    }

    const estimatedCost = calculateAudioCost(durationSeconds)

    res.json({
      durationSeconds,
      durationMinutes: (durationSeconds / 60).toFixed(2),
      estimatedCost: parseFloat(estimatedCost.toFixed(4)),
      model: 'whisper-large',
      available: !!ENDPOINTS['whisper-large']
    })
  } catch (error) {
    console.error('Error estimating audio cost:', error)
    res.status(500).json({ error: 'Failed to estimate cost' })
  }
})

/**
 * POST /api/inference/audio/transcribe
 * Transcribe audio using Whisper
 */
router.post('/audio/transcribe', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id']
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { audioUrl, audioBase64, durationSeconds, language, task = 'transcribe' } = req.body

    if (!audioUrl && !audioBase64) {
      return res.status(400).json({ error: 'Audio URL or base64 is required' })
    }

    if (!durationSeconds || durationSeconds <= 0) {
      return res.status(400).json({ error: 'Duration is required' })
    }

    // Check if endpoint is configured
    if (!ENDPOINTS['whisper-large']) {
      return res.status(400).json({ error: 'Whisper endpoint not configured' })
    }

    // Get user credits
    const creditResult = await query(
      'SELECT balance_usd FROM credits WHERE privy_id = $1',
      [privyId]
    )
    
    const balance = creditResult.rows[0]?.balance_usd || 0

    // Estimate cost
    const estimatedCost = calculateAudioCost(durationSeconds)

    if (balance < estimatedCost) {
      return res.status(400).json({ 
        error: 'Insufficient credits',
        required: estimatedCost,
        balance
      })
    }

    // Transcribe audio
    const startTime = Date.now()
    const result = await transcribeAudio({
      audioUrl,
      audioBase64,
      language,
      task
    })
    const duration = Date.now() - startTime

    // Get transcription result
    const transcript = result.output?.transcription || result.output?.text || result.output || ''
    const segments = result.output?.segments || []

    // Deduct credits
    await query(
      'UPDATE credits SET balance_usd = balance_usd - $1 WHERE privy_id = $2',
      [estimatedCost, privyId]
    )

    // Get updated balance
    const newBalanceResult = await query(
      'SELECT balance_usd FROM credits WHERE privy_id = $1',
      [privyId]
    )
    const newBalance = newBalanceResult.rows[0]?.balance_usd || 0

    // Log usage
    await query(`
      INSERT INTO usage_logs (privy_id, service, model, duration_seconds, cost, duration_ms)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [privyId, 'audio-transcription', 'whisper-large', durationSeconds, estimatedCost, duration])

    res.json({
      success: true,
      transcript,
      segments,
      usage: {
        durationSeconds,
        durationMinutes: (durationSeconds / 60).toFixed(2),
        cost: estimatedCost
      },
      durationMs: duration,
      newBalance
    })
  } catch (error) {
    console.error('Error transcribing audio:', error)
    res.status(500).json({ error: error.message || 'Failed to transcribe audio' })
  }
})

/**
 * GET /api/inference/history
 * Get user's inference history
 */
router.get('/history', async (req, res) => {
  try {
    const privyId = req.headers['x-privy-id']
    if (!privyId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const result = await query(`
      SELECT * FROM usage_logs 
      WHERE privy_id = $1 
      ORDER BY created_at DESC 
      LIMIT 50
    `, [privyId])

    res.json({ history: result.rows })
  } catch (error) {
    console.error('Error fetching history:', error)
    res.status(500).json({ error: 'Failed to fetch history' })
  }
})

export default router
