import dotenv from 'dotenv'

dotenv.config()

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY

// RunPod Serverless Endpoint IDs
// You can use public endpoints or create your own
export const ENDPOINTS = {
  // Stable Diffusion XL - you'll need to deploy your own or use a public one
  sdxl: process.env.RUNPOD_SDXL_ENDPOINT || null,
  // Llama 3 8B - text generation
  'llama-3-8b': process.env.RUNPOD_LLAMA_8B_ENDPOINT || null,
  // Llama 3 70B - larger model for complex tasks
  'llama-3-70b': process.env.RUNPOD_LLAMA_70B_ENDPOINT || null,
  // Whisper - audio transcription
  'whisper-large': process.env.RUNPOD_WHISPER_ENDPOINT || null,
}

// Model pricing (cost per unit)
export const MODEL_PRICING = {
  'sdxl': { price: 0.01, unit: 'image' },
  'llama-3-8b': { price: 0.0002, unit: '1K tokens' },
  'llama-3-70b': { price: 0.001, unit: '1K tokens' },
  'whisper-large': { price: 0.006, unit: 'minute' },
}

/**
 * Run a serverless inference job (async - returns job ID)
 */
export async function runAsync(endpointId, input) {
  if (!RUNPOD_API_KEY) {
    throw new Error('RUNPOD_API_KEY not configured')
  }

  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RUNPOD_API_KEY}`
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
 * Run a serverless inference job (sync - waits for result)
 */
export async function runSync(endpointId, input, timeout = 60000) {
  if (!RUNPOD_API_KEY) {
    throw new Error('RUNPOD_API_KEY not configured')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/runsync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RUNPOD_API_KEY}`
      },
      body: JSON.stringify({ input }),
      signal: controller.signal
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`RunPod API error: ${response.status} - ${error}`)
    }

    return response.json()
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Check status of an async job
 */
export async function getJobStatus(endpointId, jobId) {
  if (!RUNPOD_API_KEY) {
    throw new Error('RUNPOD_API_KEY not configured')
  }

  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/status/${jobId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${RUNPOD_API_KEY}`
    }
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`RunPod API error: ${response.status} - ${error}`)
  }

  return response.json()
}

/**
 * Cancel a running job
 */
export async function cancelJob(endpointId, jobId) {
  if (!RUNPOD_API_KEY) {
    throw new Error('RUNPOD_API_KEY not configured')
  }

  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/cancel/${jobId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RUNPOD_API_KEY}`
    }
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`RunPod API error: ${response.status} - ${error}`)
  }

  return response.json()
}

/**
 * Get health status of an endpoint
 */
export async function getEndpointHealth(endpointId) {
  if (!RUNPOD_API_KEY) {
    throw new Error('RUNPOD_API_KEY not configured')
  }

  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/health`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${RUNPOD_API_KEY}`
    }
  })

  if (!response.ok) {
    return { status: 'unavailable', error: response.status }
  }

  return response.json()
}

/**
 * Generate image using SDXL
 */
export async function generateImage({
  prompt,
  negativePrompt = '',
  width = 1024,
  height = 1024,
  steps = 25,
  guidanceScale = 7.5,
  seed = null
}) {
  const endpointId = ENDPOINTS.sdxl
  
  if (!endpointId) {
    throw new Error('SDXL endpoint not configured. Set RUNPOD_SDXL_ENDPOINT in .env')
  }

  const input = {
    prompt,
    negative_prompt: negativePrompt,
    width,
    height,
    num_inference_steps: steps,
    guidance_scale: guidanceScale,
    ...(seed && { seed })
  }

  return runSync(endpointId, input)
}

/**
 * Generate multiple images (batch)
 */
export async function generateImagesBatch(prompts, options = {}) {
  const endpointId = ENDPOINTS.sdxl
  
  if (!endpointId) {
    throw new Error('SDXL endpoint not configured. Set RUNPOD_SDXL_ENDPOINT in .env')
  }

  const {
    negativePrompt = '',
    width = 1024,
    height = 1024,
    steps = 25,
    guidanceScale = 7.5
  } = options

  // Submit all jobs async
  const jobs = await Promise.all(
    prompts.map(prompt => 
      runAsync(endpointId, {
        prompt,
        negative_prompt: negativePrompt,
        width,
        height,
        num_inference_steps: steps,
        guidance_scale: guidanceScale
      })
    )
  )

  return jobs.map((job, index) => ({
    jobId: job.id,
    prompt: prompts[index],
    status: job.status
  }))
}

/**
 * Generate text using Llama
 */
export async function generateText({
  prompt,
  model = 'llama-3-8b',
  maxTokens = 512,
  temperature = 0.7,
  topP = 0.9,
  systemPrompt = 'You are a helpful AI assistant.'
}) {
  const endpointId = ENDPOINTS[model]
  
  if (!endpointId) {
    throw new Error(`${model} endpoint not configured. Set RUNPOD_LLAMA_8B_ENDPOINT or RUNPOD_LLAMA_70B_ENDPOINT in .env`)
  }

  const input = {
    prompt: `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${systemPrompt}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n${prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`,
    max_new_tokens: maxTokens,
    temperature,
    top_p: topP,
    do_sample: true,
    return_full_text: false
  }

  return runSync(endpointId, input, 120000) // 2 min timeout for text generation
}

/**
 * Estimate token count (rough approximation)
 * More accurate: ~4 chars per token for English
 */
export function estimateTokens(text) {
  if (!text) return 0
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4)
}

/**
 * Calculate cost for text generation
 */
export function calculateTextCost(inputTokens, outputTokens, model = 'llama-3-8b') {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return 0
  
  const totalTokens = inputTokens + outputTokens
  const costPerToken = pricing.price / 1000 // Convert from per 1K to per token
  return totalTokens * costPerToken
}

/**
 * Transcribe audio using Whisper
 */
export async function transcribeAudio({
  audioUrl,
  audioBase64,
  language = null,
  task = 'transcribe' // 'transcribe' or 'translate'
}) {
  const endpointId = ENDPOINTS['whisper-large']
  
  if (!endpointId) {
    throw new Error('Whisper endpoint not configured. Set RUNPOD_WHISPER_ENDPOINT in .env')
  }

  const input = {
    task,
    ...(audioUrl && { audio: audioUrl }),
    ...(audioBase64 && { audio_base64: audioBase64 }),
    ...(language && { language })
  }

  return runSync(endpointId, input, 300000) // 5 min timeout for audio
}

/**
 * Calculate cost for audio transcription
 * @param durationSeconds - Audio duration in seconds
 */
export function calculateAudioCost(durationSeconds) {
  const pricing = MODEL_PRICING['whisper-large']
  if (!pricing) return 0
  
  const minutes = durationSeconds / 60
  return minutes * pricing.price
}

export default {
  runAsync,
  runSync,
  getJobStatus,
  cancelJob,
  getEndpointHealth,
  generateImage,
  generateImagesBatch,
  generateText,
  estimateTokens,
  calculateTextCost,
  transcribeAudio,
  calculateAudioCost,
  ENDPOINTS,
  MODEL_PRICING
}
