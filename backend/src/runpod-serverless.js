import dotenv from 'dotenv'

dotenv.config()

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY

// RunPod Serverless Endpoint IDs
// You can use public endpoints or create your own
export const ENDPOINTS = {
  // Stable Diffusion XL - you'll need to deploy your own or use a public one
  // Public SDXL endpoints change - we'll need to get a current one
  sdxl: process.env.RUNPOD_SDXL_ENDPOINT || null,
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

export default {
  runAsync,
  runSync,
  getJobStatus,
  cancelJob,
  getEndpointHealth,
  generateImage,
  generateImagesBatch,
  ENDPOINTS
}
