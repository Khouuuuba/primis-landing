/**
 * Together AI Provider Adapter
 * 
 * Implements IServerlessProvider interface for Together AI inference.
 * Together AI offers OpenAI-compatible API for Llama, Mistral, Mixtral, and embeddings.
 * 
 * API Reference: https://docs.together.ai/reference
 * Base URL: https://api.together.xyz/v1
 */

import { 
  PROVIDERS, 
  MODEL_CATEGORIES, 
  createModelOfferingId,
  estimateTokens 
} from './types.js'

// Lazy getter for API key (checked at runtime, not module load time)
const getApiKey = () => process.env.TOGETHER_API_KEY
const TOGETHER_BASE_URL = 'https://api.together.xyz/v1'

// Together AI Model Catalog with pricing (per 1M tokens)
// Prices as of 2025 - check https://api.together.xyz/models for current pricing
const MODEL_CATALOG = {
  // Text Generation - Llama 3
  'llama-3-8b-instruct': {
    togetherModelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    name: 'Llama 3.1 8B Instruct',
    category: MODEL_CATEGORIES.TEXT,
    description: 'Fast, efficient text generation with 128K context',
    inputPrice: 0.18,  // per 1M tokens
    outputPrice: 0.18,
    priceUnit: '1M tokens',
    contextLength: 131072,
    streaming: true
  },
  'llama-3-70b-instruct': {
    togetherModelId: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    name: 'Llama 3.1 70B Instruct',
    category: MODEL_CATEGORIES.TEXT,
    description: 'Powerful reasoning with 128K context',
    inputPrice: 0.88,
    outputPrice: 0.88,
    priceUnit: '1M tokens',
    contextLength: 131072,
    streaming: true
  },
  'llama-3-405b-instruct': {
    togetherModelId: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
    name: 'Llama 3.1 405B Instruct',
    category: MODEL_CATEGORIES.TEXT,
    description: 'Most capable open model, GPT-4 level',
    inputPrice: 3.50,
    outputPrice: 3.50,
    priceUnit: '1M tokens',
    contextLength: 131072,
    streaming: true
  },
  // Text Generation - Mistral
  'mistral-7b-instruct': {
    togetherModelId: 'mistralai/Mistral-7B-Instruct-v0.3',
    name: 'Mistral 7B Instruct',
    category: MODEL_CATEGORIES.TEXT,
    description: 'Fast and efficient, great for simple tasks',
    inputPrice: 0.20,
    outputPrice: 0.20,
    priceUnit: '1M tokens',
    contextLength: 32768,
    streaming: true
  },
  'mixtral-8x7b-instruct': {
    togetherModelId: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
    name: 'Mixtral 8x7B Instruct',
    category: MODEL_CATEGORIES.TEXT,
    description: 'MoE architecture, excellent quality/cost ratio',
    inputPrice: 0.60,
    outputPrice: 0.60,
    priceUnit: '1M tokens',
    contextLength: 32768,
    streaming: true
  },
  'mixtral-8x22b-instruct': {
    togetherModelId: 'mistralai/Mixtral-8x22B-Instruct-v0.1',
    name: 'Mixtral 8x22B Instruct',
    category: MODEL_CATEGORIES.TEXT,
    description: 'Large MoE model, powerful reasoning',
    inputPrice: 1.20,
    outputPrice: 1.20,
    priceUnit: '1M tokens',
    contextLength: 65536,
    streaming: true
  },
  // Code Generation
  'codellama-34b-instruct': {
    togetherModelId: 'codellama/CodeLlama-34b-Instruct-hf',
    name: 'Code Llama 34B Instruct',
    category: MODEL_CATEGORIES.TEXT,
    description: 'Optimized for code generation and completion',
    inputPrice: 0.78,
    outputPrice: 0.78,
    priceUnit: '1M tokens',
    contextLength: 16384,
    streaming: true
  },
  // Embeddings
  'bge-large-en': {
    togetherModelId: 'BAAI/bge-large-en-v1.5',
    name: 'BGE Large English',
    category: MODEL_CATEGORIES.EMBEDDING,
    description: 'High-quality text embeddings (1024 dims)',
    inputPrice: 0.02,
    priceUnit: '1M tokens',
    dimensions: 1024
  },
  'bge-base-en': {
    togetherModelId: 'BAAI/bge-base-en-v1.5',
    name: 'BGE Base English',
    category: MODEL_CATEGORIES.EMBEDDING,
    description: 'Efficient text embeddings (768 dims)',
    inputPrice: 0.01,
    priceUnit: '1M tokens',
    dimensions: 768
  },
  'm2-bert-80m': {
    togetherModelId: 'togethercomputer/m2-bert-80M-8k-retrieval',
    name: 'M2-BERT 80M Retrieval',
    category: MODEL_CATEGORIES.EMBEDDING,
    description: 'Lightweight embeddings for retrieval',
    inputPrice: 0.008,
    priceUnit: '1M tokens',
    dimensions: 768
  }
}

/**
 * Make API request to Together AI
 */
async function togetherRequest(endpoint, body, timeout = 60000) {
  if (!getApiKey()) {
    throw new Error('getApiKey() not configured')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const startTime = Date.now()
    const response = await fetch(`${TOGETHER_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getApiKey()}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Together AI API error: ${response.status} - ${error}`)
    }

    const result = await response.json()
    result._latencyMs = Date.now() - startTime
    return result
  } finally {
    clearTimeout(timeoutId)
  }
}

// =============================================================================
// TOGETHER AI SERVERLESS PROVIDER
// =============================================================================

/**
 * Together AI Serverless Provider
 * @implements {IServerlessProvider}
 */
const TogetherAiProvider = {
  name: PROVIDERS.TOGETHER,

  /**
   * Check if provider is configured
   */
  async isConfigured() {
    return !!getApiKey()
  },

  /**
   * Get provider health status
   */
  async getHealth() {
    const startTime = Date.now()

    try {
      if (!getApiKey()) {
        return {
          provider: PROVIDERS.TOGETHER,
          status: 'unavailable',
          latencyMs: 0,
          checkedAt: new Date(),
          message: 'API key not configured'
        }
      }

      // Quick health check with minimal request
      const response = await fetch(`${TOGETHER_BASE_URL}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${getApiKey()}`
        }
      })

      const latencyMs = Date.now() - startTime

      return {
        provider: PROVIDERS.TOGETHER,
        status: response.ok ? 'healthy' : 'degraded',
        latencyMs,
        checkedAt: new Date(),
        message: response.ok ? 'Connected' : `HTTP ${response.status}`
      }
    } catch (error) {
      return {
        provider: PROVIDERS.TOGETHER,
        status: 'unavailable',
        latencyMs: Date.now() - startTime,
        checkedAt: new Date(),
        message: error.message
      }
    }
  },

  /**
   * List available models
   * @returns {Promise<ModelOffering[]>}
   */
  async getModels() {
    // Always return models, mark as available based on API key config
    const isConfigured = !!getApiKey()

    return Object.entries(MODEL_CATALOG).map(([id, model]) => ({
      id: createModelOfferingId(PROVIDERS.TOGETHER, id),
      provider: PROVIDERS.TOGETHER,
      name: model.name,
      category: model.category,
      description: model.description,
      inputPrice: model.inputPrice,
      outputPrice: model.outputPrice,
      priceUnit: model.priceUnit,
      contextLength: model.contextLength,
      available: isConfigured,
      streaming: model.streaming || false,
      metadata: {
        togetherModelId: model.togetherModelId,
        internalId: id,
        dimensions: model.dimensions
      }
    }))
  },

  /**
   * Generate text using chat completion API
   * @param {string} modelId - Model offering ID
   * @param {TextGenerationInput} input
   * @returns {Promise<TextGenerationOutput>}
   */
  async generateText(modelId, input) {
    const {
      prompt,
      systemPrompt = 'You are a helpful AI assistant.',
      maxTokens = 512,
      temperature = 0.7,
      topP = 0.9,
      stream = false
    } = input

    // Find model in catalog
    const internalId = modelId.replace('together-', '')
    const model = MODEL_CATALOG[internalId]

    if (!model) {
      throw new Error(`Model not found: ${modelId}`)
    }

    // Use chat completions API (OpenAI-compatible)
    const result = await togetherRequest('/chat/completions', {
      model: model.togetherModelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      stream: false // TODO: Implement streaming
    }, 120000)

    const generatedText = result.choices?.[0]?.message?.content || ''
    const inputTokens = result.usage?.prompt_tokens || estimateTokens(prompt + systemPrompt)
    const outputTokens = result.usage?.completion_tokens || estimateTokens(generatedText)

    // Calculate cost (per 1M tokens)
    const inputCost = (inputTokens / 1_000_000) * model.inputPrice
    const outputCost = (outputTokens / 1_000_000) * (model.outputPrice || model.inputPrice)
    const totalCost = inputCost + outputCost

    return {
      text: generatedText,
      inputTokens,
      outputTokens,
      cost: totalCost,
      latencyMs: result._latencyMs,
      metadata: {
        provider: PROVIDERS.TOGETHER,
        model: internalId,
        togetherModelId: model.togetherModelId,
        finishReason: result.choices?.[0]?.finish_reason
      }
    }
  },

  /**
   * Generate embeddings
   * @param {string} modelId - Model offering ID
   * @param {EmbeddingInput} input
   * @returns {Promise<EmbeddingOutput>}
   */
  async generateEmbedding(modelId, input) {
    const { text } = input

    // Find model in catalog
    const internalId = modelId.replace('together-', '')
    const model = MODEL_CATALOG[internalId]

    if (!model || model.category !== MODEL_CATEGORIES.EMBEDDING) {
      throw new Error(`Embedding model not found: ${modelId}`)
    }

    // Handle single string or array
    const texts = Array.isArray(text) ? text : [text]

    const result = await togetherRequest('/embeddings', {
      model: model.togetherModelId,
      input: texts
    })

    const embeddings = result.data?.map(d => d.embedding) || []
    const inputTokens = result.usage?.total_tokens || texts.reduce((sum, t) => sum + estimateTokens(t), 0)
    const cost = (inputTokens / 1_000_000) * model.inputPrice

    return {
      embeddings,
      inputTokens,
      cost,
      metadata: {
        provider: PROVIDERS.TOGETHER,
        model: internalId,
        dimensions: model.dimensions
      }
    }
  },

  /**
   * Image generation - Together AI supports SDXL and Flux
   * Note: Primarily text-focused provider, image support is secondary
   */
  async generateImage(modelId, input) {
    throw new Error('Together AI image generation not implemented - use RunPod for images')
  },

  /**
   * Audio transcription - Not supported by Together AI
   */
  async transcribeAudio(modelId, input) {
    throw new Error('Together AI does not support audio transcription - use RunPod Whisper')
  }
}

export { MODEL_CATALOG, TOGETHER_BASE_URL }
export default TogetherAiProvider
