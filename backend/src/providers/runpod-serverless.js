/**
 * RunPod Serverless Provider Adapter
 * 
 * Implements IServerlessProvider interface for RunPod serverless inference.
 * Supports SDXL image generation, Llama text generation, and Whisper audio.
 */

import { 
  PROVIDERS, 
  MODEL_CATEGORIES, 
  createModelOfferingId,
  estimateTokens 
} from './types.js'

// Lazy getter for API key (checked at runtime, not module load time)
const getApiKey = () => process.env.RUNPOD_API_KEY

// Endpoint IDs from environment
const ENDPOINTS = {
  sdxl: process.env.RUNPOD_SDXL_ENDPOINT || null,
  'llama-3-8b': process.env.RUNPOD_LLAMA_8B_ENDPOINT || null,
  'llama-3-70b': process.env.RUNPOD_LLAMA_70B_ENDPOINT || null,
  'whisper-large': process.env.RUNPOD_WHISPER_ENDPOINT || null,
}

// Model catalog with pricing
const MODEL_CATALOG = {
  'sdxl': {
    name: 'SDXL 1.0',
    category: MODEL_CATEGORIES.IMAGE,
    description: 'High-quality image generation',
    inputPrice: 0.01,
    priceUnit: 'image',
    available: !!ENDPOINTS.sdxl
  },
  'llama-3-8b': {
    name: 'Llama 3 8B Instruct',
    category: MODEL_CATEGORIES.TEXT,
    description: 'Fast, efficient text generation',
    inputPrice: 0.0002,
    outputPrice: 0.0002,
    priceUnit: '1K tokens',
    contextLength: 8192,
    streaming: false,
    available: !!ENDPOINTS['llama-3-8b']
  },
  'llama-3-70b': {
    name: 'Llama 3 70B Instruct',
    category: MODEL_CATEGORIES.TEXT,
    description: 'Powerful reasoning and generation',
    inputPrice: 0.001,
    outputPrice: 0.001,
    priceUnit: '1K tokens',
    contextLength: 8192,
    streaming: false,
    available: !!ENDPOINTS['llama-3-70b']
  },
  'whisper-large': {
    name: 'Whisper Large V3',
    category: MODEL_CATEGORIES.AUDIO,
    description: 'Audio transcription and translation',
    inputPrice: 0.006,
    priceUnit: 'minute',
    available: !!ENDPOINTS['whisper-large']
  }
}

/**
 * Run async inference (returns job ID)
 */
async function runAsync(endpointId, input) {
  if (!getApiKey()) {
    throw new Error('getApiKey() not configured')
  }

  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`
    },
    body: JSON.stringify({ input })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`RunPod API error: ${response.status} - ${error}`)
  }

  return response.json()
}

/**
 * Run sync inference (waits for result)
 */
async function runSync(endpointId, input, timeout = 60000) {
  if (!getApiKey()) {
    throw new Error('getApiKey() not configured')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const startTime = Date.now()
    const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/runsync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getApiKey()}`
      },
      body: JSON.stringify({ input }),
      signal: controller.signal
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`RunPod API error: ${response.status} - ${error}`)
    }

    const result = await response.json()
    result.latencyMs = Date.now() - startTime
    return result
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Get job status
 */
async function getJobStatus(endpointId, jobId) {
  if (!getApiKey()) {
    throw new Error('getApiKey() not configured')
  }

  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/status/${jobId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`
    }
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`RunPod API error: ${response.status} - ${error}`)
  }

  return response.json()
}

/**
 * Get endpoint health
 */
async function getEndpointHealth(endpointId) {
  if (!getApiKey() || !endpointId) {
    return { status: 'unavailable', workers: { idle: 0, running: 0 } }
  }

  try {
    const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/health`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`
      }
    })

    if (!response.ok) {
      return { status: 'unavailable', error: response.status }
    }

    return response.json()
  } catch {
    return { status: 'unavailable' }
  }
}

// =============================================================================
// SERVERLESS PROVIDER IMPLEMENTATION
// =============================================================================

/**
 * RunPod Serverless Provider
 * @implements {IServerlessProvider}
 */
const RunPodServerlessProvider = {
  name: PROVIDERS.RUNPOD,

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
          provider: PROVIDERS.RUNPOD,
          status: 'unavailable',
          latencyMs: 0,
          checkedAt: new Date(),
          message: 'API key not configured'
        }
      }

      // Check SDXL endpoint as primary health indicator
      const health = await getEndpointHealth(ENDPOINTS.sdxl)
      const latencyMs = Date.now() - startTime

      return {
        provider: PROVIDERS.RUNPOD,
        status: health.status === 'healthy' || health.workers?.idle > 0 ? 'healthy' : 'degraded',
        latencyMs,
        checkedAt: new Date(),
        services: {
          sdxl: { available: !!ENDPOINTS.sdxl },
          llama8b: { available: !!ENDPOINTS['llama-3-8b'] },
          llama70b: { available: !!ENDPOINTS['llama-3-70b'] },
          whisper: { available: !!ENDPOINTS['whisper-large'] }
        }
      }
    } catch (error) {
      return {
        provider: PROVIDERS.RUNPOD,
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
    return Object.entries(MODEL_CATALOG).map(([id, model]) => ({
      id: createModelOfferingId(PROVIDERS.RUNPOD, id),
      provider: PROVIDERS.RUNPOD,
      name: model.name,
      category: model.category,
      description: model.description,
      inputPrice: model.inputPrice,
      outputPrice: model.outputPrice,
      priceUnit: model.priceUnit,
      contextLength: model.contextLength,
      available: model.available,
      streaming: model.streaming || false,
      metadata: {
        endpointId: ENDPOINTS[id],
        internalId: id
      }
    }))
  },

  /**
   * Generate text using Llama
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
      topP = 0.9
    } = input

    // Map model ID to internal ID
    const internalId = modelId.includes('70b') ? 'llama-3-70b' : 'llama-3-8b'
    const endpointId = ENDPOINTS[internalId]

    if (!endpointId) {
      throw new Error(`Model endpoint not configured: ${internalId}`)
    }

    const formattedPrompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${systemPrompt}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n${prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`

    const result = await runSync(endpointId, {
      prompt: formattedPrompt,
      max_new_tokens: maxTokens,
      temperature,
      top_p: topP,
      do_sample: true,
      return_full_text: false
    }, 120000)

    const generatedText = result.output?.generated_text || result.output || ''
    const inputTokens = estimateTokens(prompt + systemPrompt)
    const outputTokens = estimateTokens(generatedText)
    const pricing = MODEL_CATALOG[internalId]
    const cost = ((inputTokens + outputTokens) / 1000) * pricing.inputPrice

    return {
      text: generatedText,
      inputTokens,
      outputTokens,
      cost,
      latencyMs: result.latencyMs,
      metadata: {
        provider: PROVIDERS.RUNPOD,
        model: internalId,
        jobId: result.id
      }
    }
  },

  /**
   * Generate image using SDXL
   * @param {string} modelId - Model offering ID
   * @param {ImageGenerationInput} input
   * @returns {Promise<ImageGenerationOutput>}
   */
  async generateImage(modelId, input) {
    const {
      prompt,
      negativePrompt = '',
      width = 1024,
      height = 1024,
      steps = 25,
      guidanceScale = 7.5,
      seed = null
    } = input

    const endpointId = ENDPOINTS.sdxl

    if (!endpointId) {
      throw new Error('SDXL endpoint not configured')
    }

    const result = await runSync(endpointId, {
      prompt,
      negative_prompt: negativePrompt,
      width,
      height,
      num_inference_steps: steps,
      guidance_scale: guidanceScale,
      ...(seed && { seed })
    })

    const pricing = MODEL_CATALOG.sdxl

    return {
      imageUrl: result.output?.image || result.output,
      imageBase64: result.output?.image_base64,
      cost: pricing.inputPrice,
      latencyMs: result.latencyMs,
      metadata: {
        provider: PROVIDERS.RUNPOD,
        model: 'sdxl',
        jobId: result.id,
        seed: result.output?.seed
      }
    }
  },

  /**
   * Generate images in batch (async)
   * @param {string} modelId - Model offering ID
   * @param {ImageGenerationInput[]} inputs
   * @returns {Promise<{jobId: string, prompt: string}[]>}
   */
  async generateImageBatch(modelId, inputs) {
    const endpointId = ENDPOINTS.sdxl

    if (!endpointId) {
      throw new Error('SDXL endpoint not configured')
    }

    const jobs = await Promise.all(
      inputs.map(input => 
        runAsync(endpointId, {
          prompt: input.prompt,
          negative_prompt: input.negativePrompt || '',
          width: input.width || 1024,
          height: input.height || 1024,
          num_inference_steps: input.steps || 25,
          guidance_scale: input.guidanceScale || 7.5
        })
      )
    )

    return jobs.map((job, index) => ({
      jobId: job.id,
      prompt: inputs[index].prompt,
      status: job.status
    }))
  },

  /**
   * Check batch job status
   * @param {string} modelId - Model offering ID
   * @param {string} jobId - Job ID
   */
  async getJobStatus(modelId, jobId) {
    const endpointId = ENDPOINTS.sdxl
    if (!endpointId) {
      throw new Error('SDXL endpoint not configured')
    }
    return getJobStatus(endpointId, jobId)
  },

  /**
   * Transcribe audio using Whisper
   * @param {string} modelId - Model offering ID
   * @param {AudioTranscriptionInput} input
   * @returns {Promise<AudioTranscriptionOutput>}
   */
  async transcribeAudio(modelId, input) {
    const {
      audioUrl,
      audioBase64,
      language = null,
      task = 'transcribe'
    } = input

    const endpointId = ENDPOINTS['whisper-large']

    if (!endpointId) {
      throw new Error('Whisper endpoint not configured')
    }

    const result = await runSync(endpointId, {
      task,
      ...(audioUrl && { audio: audioUrl }),
      ...(audioBase64 && { audio_base64: audioBase64 }),
      ...(language && { language })
    }, 300000)

    const text = result.output?.text || result.output || ''
    const durationSeconds = result.output?.duration || 0
    const pricing = MODEL_CATALOG['whisper-large']
    const cost = (durationSeconds / 60) * pricing.inputPrice

    return {
      text,
      durationSeconds,
      cost,
      latencyMs: result.latencyMs,
      segments: result.output?.segments,
      metadata: {
        provider: PROVIDERS.RUNPOD,
        model: 'whisper-large',
        jobId: result.id,
        language: result.output?.language
      }
    }
  }
}

// Export for backward compatibility
export { ENDPOINTS, MODEL_CATALOG, getJobStatus, getEndpointHealth }

export default RunPodServerlessProvider
