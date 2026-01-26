/**
 * Provider Routes
 * 
 * Unified API for multi-provider GPU and serverless operations.
 * Uses the provider registry for aggregation and smart routing.
 */

import express from 'express'
import { requireAuth, flexibleAuth } from '../middleware/auth.js'
import providers, { PROVIDERS, MODEL_CATEGORIES } from '../providers/index.js'
import router_module, { 
  getGPURecommendations, 
  getModelRecommendations, 
  getQuickRecommendation,
  comparePrices,
  invalidateCache 
} from '../providers/router.js'

const router = express.Router()

// =============================================================================
// HEALTH & STATUS
// =============================================================================

/**
 * GET /api/providers/health - Get health status of all providers
 */
router.get('/health', async (req, res) => {
  try {
    const health = await providers.getAllProviderHealth()
    
    res.json({
      success: true,
      providers: health,
      summary: {
        total: health.length,
        healthy: health.filter(h => h.status === 'healthy').length,
        degraded: health.filter(h => h.status === 'degraded').length,
        unavailable: health.filter(h => h.status === 'unavailable').length
      }
    })
  } catch (error) {
    console.error('Error checking provider health:', error)
    res.status(500).json({ success: false, error: 'Failed to check provider health' })
  }
})

// =============================================================================
// GPU INSTANCES
// =============================================================================

/**
 * GET /api/providers/gpus - List all GPU offerings from all providers
 * 
 * Query params:
 * - minVram: Minimum VRAM in GB
 * - maxPrice: Maximum price per hour
 * - gpuTypes: Comma-separated GPU types (e.g., "RTX 4090,A100")
 * - providers: Comma-separated provider names to include
 */
router.get('/gpus', async (req, res) => {
  try {
    const { minVram, maxPrice, gpuTypes, providers: providerFilter } = req.query
    
    let offerings = await providers.getAllGPUOfferings()
    
    // Apply filters
    if (minVram) {
      offerings = offerings.filter(o => o.vramGb >= parseInt(minVram))
    }
    
    if (maxPrice) {
      offerings = offerings.filter(o => o.pricePerHour <= parseFloat(maxPrice))
    }
    
    if (gpuTypes) {
      const types = gpuTypes.split(',').map(t => t.trim().toUpperCase())
      offerings = offerings.filter(o => 
        types.some(t => o.gpuType.toUpperCase().includes(t))
      )
    }
    
    if (providerFilter) {
      const allowedProviders = providerFilter.split(',').map(p => p.trim())
      offerings = offerings.filter(o => allowedProviders.includes(o.provider))
    }
    
    // Group by provider for summary
    const byProvider = {}
    offerings.forEach(o => {
      if (!byProvider[o.provider]) {
        byProvider[o.provider] = { count: 0, cheapest: Infinity }
      }
      byProvider[o.provider].count++
      byProvider[o.provider].cheapest = Math.min(byProvider[o.provider].cheapest, o.pricePerHour)
    })
    
    res.json({
      success: true,
      offerings,
      summary: {
        total: offerings.length,
        byProvider,
        priceRange: {
          min: offerings.length > 0 ? Math.min(...offerings.map(o => o.pricePerHour)) : 0,
          max: offerings.length > 0 ? Math.max(...offerings.map(o => o.pricePerHour)) : 0
        }
      }
    })
  } catch (error) {
    console.error('Error listing GPU offerings:', error)
    res.status(500).json({ success: false, error: 'Failed to list GPU offerings' })
  }
})

/**
 * POST /api/providers/gpus/recommend - Get smart GPU recommendations
 * 
 * Body:
 * - minVram: Minimum VRAM in GB
 * - maxVram: Maximum VRAM in GB
 * - gpuTypes: Array of acceptable GPU types (e.g., ["RTX 4090", "A100"])
 * - maxPrice: Maximum price per hour
 * - preferredProviders: Array of preferred providers (get boosted score)
 * - excludeProviders: Array of providers to exclude
 * - strategy: 'cheapest' | 'fastest' | 'reliable' | 'balanced' | 'value'
 * - limit: Max results (default 10)
 */
router.post('/gpus/recommend', async (req, res) => {
  try {
    const result = await getGPURecommendations(
      req.body,
      providers.getAllGPUOfferings,
      providers.getAllProviderHealth
    )
    
    res.json({
      success: true,
      ...result
    })
  } catch (error) {
    console.error('Error getting GPU recommendations:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// =============================================================================
// SERVERLESS MODELS
// =============================================================================

/**
 * GET /api/providers/models - List all model offerings from all providers
 * 
 * Query params:
 * - category: 'text' | 'image' | 'audio' | 'embedding'
 * - providers: Comma-separated provider names
 */
router.get('/models', async (req, res) => {
  try {
    const { category, providers: providerFilter } = req.query
    
    let models = await providers.getAllModelOfferings()
    
    // Apply filters
    if (category) {
      models = models.filter(m => m.category === category)
    }
    
    if (providerFilter) {
      const allowedProviders = providerFilter.split(',').map(p => p.trim())
      models = models.filter(m => allowedProviders.includes(m.provider))
    }
    
    // Group by category
    const byCategory = {}
    Object.values(MODEL_CATEGORIES).forEach(cat => {
      byCategory[cat] = models.filter(m => m.category === cat)
    })
    
    res.json({
      success: true,
      models,
      byCategory,
      categories: Object.values(MODEL_CATEGORIES),
      availableProviders: [...new Set(models.map(m => m.provider))]
    })
  } catch (error) {
    console.error('Error listing models:', error)
    res.status(500).json({ success: false, error: 'Failed to list models' })
  }
})

/**
 * POST /api/providers/models/recommend - Get smart model recommendations
 * 
 * Body:
 * - category: Model category (text, image, audio, embedding) - REQUIRED
 * - maxCost: Maximum cost per unit
 * - minContext: Minimum context length (for text models)
 * - streaming: Require streaming support (boolean)
 * - preferredProviders: Array of preferred providers
 * - excludeProviders: Providers to exclude
 * - strategy: 'cheapest' | 'fastest' | 'reliable' | 'balanced'
 * - limit: Max results (default 10)
 */
router.post('/models/recommend', async (req, res) => {
  try {
    const result = await getModelRecommendations(
      req.body,
      providers.getAllModelOfferings,
      providers.getAllProviderHealth
    )
    
    res.json({
      success: true,
      ...result
    })
  } catch (error) {
    console.error('Error getting model recommendations:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/providers/recommend/:useCase - Quick recommendation for common use cases
 * 
 * Use cases:
 * GPU: inference-small, inference-medium, inference-large, training-small, training-large, training-enterprise
 * Model: chat-fast, chat-quality, coding, embedding, image-gen, transcription
 */
router.get('/recommend/:useCase', async (req, res) => {
  try {
    const { useCase } = req.params
    
    const result = await getQuickRecommendation(
      useCase,
      providers.getAllGPUOfferings,
      providers.getAllModelOfferings,
      providers.getAllProviderHealth
    )
    
    res.json({
      success: true,
      ...result
    })
  } catch (error) {
    console.error('Error getting quick recommendation:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * GET /api/providers/compare/:gpuType - Compare prices across providers
 */
router.get('/compare/:gpuType', async (req, res) => {
  try {
    const { gpuType } = req.params
    
    const result = await comparePrices(gpuType, providers.getAllGPUOfferings)
    
    res.json({
      success: true,
      ...result
    })
  } catch (error) {
    console.error('Error comparing prices:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/providers/cache/invalidate - Invalidate price cache
 */
router.post('/cache/invalidate', async (req, res) => {
  try {
    invalidateCache()
    res.json({ success: true, message: 'Cache invalidated' })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// =============================================================================
// INFERENCE OPERATIONS (requires auth)
// =============================================================================

/**
 * POST /api/providers/inference/text - Generate text using best available model
 * 
 * Body:
 * - modelId: Model offering ID (e.g., 'runpod-llama-3-8b')
 * - prompt: User prompt
 * - systemPrompt: System prompt
 * - maxTokens: Maximum output tokens
 * - temperature: Sampling temperature
 */
router.post('/inference/text', flexibleAuth, async (req, res) => {
  try {
    const { modelId, prompt, systemPrompt, maxTokens, temperature } = req.body
    
    if (!modelId || !prompt) {
      return res.status(400).json({ 
        success: false, 
        error: 'modelId and prompt are required' 
      })
    }
    
    const result = await providers.generateText(modelId, {
      prompt,
      systemPrompt,
      maxTokens,
      temperature
    })
    
    res.json({
      success: true,
      result: result.text,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens: result.inputTokens + result.outputTokens
      },
      cost: result.cost,
      latencyMs: result.latencyMs,
      provider: result.metadata?.provider
    })
  } catch (error) {
    console.error('Error generating text:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/providers/inference/image - Generate image
 * 
 * Body:
 * - modelId: Model offering ID
 * - prompt: Image prompt
 * - negativePrompt: Negative prompt
 * - width, height: Image dimensions
 * - steps: Inference steps
 */
router.post('/inference/image', flexibleAuth, async (req, res) => {
  try {
    const { modelId, prompt, negativePrompt, width, height, steps, guidanceScale } = req.body
    
    if (!modelId || !prompt) {
      return res.status(400).json({ 
        success: false, 
        error: 'modelId and prompt are required' 
      })
    }
    
    const result = await providers.generateImage(modelId, {
      prompt,
      negativePrompt,
      width,
      height,
      steps,
      guidanceScale
    })
    
    res.json({
      success: true,
      imageUrl: result.imageUrl,
      cost: result.cost,
      latencyMs: result.latencyMs,
      provider: result.metadata?.provider
    })
  } catch (error) {
    console.error('Error generating image:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/providers/inference/audio - Transcribe audio
 * 
 * Body:
 * - modelId: Model offering ID
 * - audioUrl: URL to audio file
 * - audioBase64: Base64 encoded audio
 * - language: Language code
 * - task: 'transcribe' | 'translate'
 */
router.post('/inference/audio', flexibleAuth, async (req, res) => {
  try {
    const { modelId, audioUrl, audioBase64, language, task } = req.body
    
    if (!modelId || (!audioUrl && !audioBase64)) {
      return res.status(400).json({ 
        success: false, 
        error: 'modelId and audio (url or base64) are required' 
      })
    }
    
    const result = await providers.transcribeAudio(modelId, {
      audioUrl,
      audioBase64,
      language,
      task
    })
    
    res.json({
      success: true,
      transcript: result.text,
      duration: result.durationSeconds,
      cost: result.cost,
      latencyMs: result.latencyMs,
      provider: result.metadata?.provider
    })
  } catch (error) {
    console.error('Error transcribing audio:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/providers/inference/embedding - Generate embeddings
 * 
 * Body:
 * - modelId: Model offering ID (e.g., 'together-bge-large-en')
 * - text: String or array of strings to embed
 */
router.post('/inference/embedding', flexibleAuth, async (req, res) => {
  try {
    const { modelId, text } = req.body
    
    if (!modelId || !text) {
      return res.status(400).json({ 
        success: false, 
        error: 'modelId and text are required' 
      })
    }
    
    const result = await providers.generateEmbedding(modelId, { text })
    
    res.json({
      success: true,
      embeddings: result.embeddings,
      dimensions: result.metadata?.dimensions,
      inputTokens: result.inputTokens,
      cost: result.cost,
      provider: result.metadata?.provider
    })
  } catch (error) {
    console.error('Error generating embeddings:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// =============================================================================
// AVAILABLE PROVIDERS LIST
// =============================================================================

/**
 * GET /api/providers/list - List all supported providers
 */
router.get('/list', (req, res) => {
  res.json({
    success: true,
    providers: [
      {
        name: PROVIDERS.RUNPOD,
        displayName: 'RunPod',
        capabilities: ['instances', 'serverless'],
        status: 'active',
        features: ['GPU instances', 'SDXL image generation', 'Whisper transcription']
      },
      {
        name: PROVIDERS.TOGETHER,
        displayName: 'Together AI',
        capabilities: ['serverless'],
        status: 'active',
        features: ['Llama 3.1 (8B/70B/405B)', 'Mistral/Mixtral', 'Code Llama', 'Embeddings (BGE)']
      },
      {
        name: PROVIDERS.VASTAI,
        displayName: 'Vast.ai',
        capabilities: ['instances'],
        status: 'active',
        features: ['Cheapest GPUs (30-50% cheaper)', 'RTX 4090/3090', 'A100/H100', 'Consumer & datacenter']
      },
      {
        name: PROVIDERS.LAMBDA,
        displayName: 'Lambda Labs',
        capabilities: ['instances'],
        status: 'coming_soon',
        features: ['A100', 'H100', 'Enterprise SLA', '99.9% uptime']
      }
    ]
  })
})

export default router
