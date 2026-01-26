/**
 * Unified Provider Interface Types
 * 
 * These types define the contract for all GPU providers (RunPod, Together AI, Vast.ai, Lambda Labs).
 * Each provider adapter must implement these interfaces.
 */

/**
 * @typedef {'runpod' | 'together' | 'vastai' | 'lambda'} ProviderName
 */

/**
 * @typedef {'instances' | 'serverless' | 'both'} ProviderCapability
 */

/**
 * @typedef {'healthy' | 'degraded' | 'unavailable'} HealthStatus
 */

/**
 * @typedef {'pending' | 'running' | 'stopped' | 'terminated' | 'error'} InstanceStatus
 */

/**
 * @typedef {'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled'} JobStatus
 */

// =============================================================================
// GPU & INSTANCE TYPES
// =============================================================================

/**
 * @typedef {Object} GPUOffering
 * @property {string} id - Unique ID for this offering (e.g., 'runpod-rtx4090')
 * @property {ProviderName} provider - Provider name
 * @property {string} gpuType - GPU model name (e.g., 'RTX 4090', 'A100 80GB')
 * @property {number} vramGb - GPU memory in GB
 * @property {number} gpuCount - Number of GPUs
 * @property {number} pricePerHour - Price in USD per hour (Primis rate)
 * @property {number} marketPrice - Market rate for comparison
 * @property {boolean} available - Whether this GPU is currently available
 * @property {string} [region] - Geographic region
 * @property {number} [reliability] - Reliability score 0-1
 * @property {Object} [metadata] - Provider-specific metadata
 */

/**
 * @typedef {Object} InstanceConfig
 * @property {string} name - Instance name
 * @property {string} gpuOfferingId - ID from GPUOffering
 * @property {number} [gpuCount=1] - Number of GPUs
 * @property {string} [image] - Docker image to use
 * @property {number} [volumeGb=20] - Persistent volume size
 * @property {number} [diskGb=20] - Container disk size
 * @property {Object} [env] - Environment variables
 */

/**
 * @typedef {Object} Instance
 * @property {string} id - Provider's instance ID
 * @property {ProviderName} provider - Provider name
 * @property {string} name - Instance name
 * @property {InstanceStatus} status - Current status
 * @property {string} gpuType - GPU model name
 * @property {number} gpuCount - Number of GPUs
 * @property {number} pricePerHour - Current price
 * @property {string} [sshHost] - SSH hostname
 * @property {number} [sshPort] - SSH port
 * @property {string} [jupyterUrl] - Jupyter URL if available
 * @property {number} [uptimeSeconds] - Time running in seconds
 * @property {Date} createdAt - When instance was created
 * @property {Object} [metrics] - GPU utilization, memory, etc.
 * @property {Object} [metadata] - Provider-specific data
 */

// =============================================================================
// SERVERLESS/INFERENCE TYPES
// =============================================================================

/**
 * @typedef {'text' | 'image' | 'audio' | 'embedding'} ModelCategory
 */

/**
 * @typedef {Object} ModelOffering
 * @property {string} id - Unique model ID (e.g., 'together-llama-3-8b')
 * @property {ProviderName} provider - Provider name
 * @property {string} name - Display name (e.g., 'Llama 3 8B Instruct')
 * @property {ModelCategory} category - Model category
 * @property {string} [description] - Model description
 * @property {number} inputPrice - Price per unit (tokens/image/minute)
 * @property {number} [outputPrice] - Price for output (for text models)
 * @property {string} priceUnit - Unit description ('1M tokens', 'image', 'minute')
 * @property {number} [contextLength] - Max context length for text models
 * @property {boolean} available - Whether model is available
 * @property {boolean} [streaming] - Supports streaming responses
 * @property {Object} [metadata] - Provider-specific data
 */

/**
 * @typedef {Object} TextGenerationInput
 * @property {string} prompt - User prompt
 * @property {string} [systemPrompt] - System prompt
 * @property {number} [maxTokens=512] - Maximum output tokens
 * @property {number} [temperature=0.7] - Sampling temperature
 * @property {number} [topP=0.9] - Top-p sampling
 * @property {boolean} [stream=false] - Enable streaming
 */

/**
 * @typedef {Object} TextGenerationOutput
 * @property {string} text - Generated text
 * @property {number} inputTokens - Tokens in prompt
 * @property {number} outputTokens - Tokens generated
 * @property {number} cost - Total cost in USD
 * @property {number} latencyMs - Time to generate
 * @property {Object} [metadata] - Provider-specific data
 */

/**
 * @typedef {Object} ImageGenerationInput
 * @property {string} prompt - Image prompt
 * @property {string} [negativePrompt] - Negative prompt
 * @property {number} [width=1024] - Image width
 * @property {number} [height=1024] - Image height
 * @property {number} [steps=25] - Inference steps
 * @property {number} [guidanceScale=7.5] - Guidance scale
 * @property {number} [seed] - Random seed
 */

/**
 * @typedef {Object} ImageGenerationOutput
 * @property {string} imageUrl - URL to generated image
 * @property {string} [imageBase64] - Base64 encoded image
 * @property {number} cost - Cost in USD
 * @property {number} latencyMs - Time to generate
 * @property {Object} [metadata] - Provider-specific data
 */

/**
 * @typedef {Object} AudioTranscriptionInput
 * @property {string} [audioUrl] - URL to audio file
 * @property {string} [audioBase64] - Base64 encoded audio
 * @property {string} [language] - Language code
 * @property {'transcribe' | 'translate'} [task='transcribe'] - Task type
 */

/**
 * @typedef {Object} AudioTranscriptionOutput
 * @property {string} text - Transcribed text
 * @property {number} durationSeconds - Audio duration
 * @property {number} cost - Cost in USD
 * @property {number} latencyMs - Time to transcribe
 * @property {Object} [segments] - Word-level timestamps
 * @property {Object} [metadata] - Provider-specific data
 */

/**
 * @typedef {Object} EmbeddingInput
 * @property {string|string[]} text - Text(s) to embed
 * @property {string} [model] - Embedding model
 */

/**
 * @typedef {Object} EmbeddingOutput
 * @property {number[][]} embeddings - Embedding vectors
 * @property {number} inputTokens - Tokens processed
 * @property {number} cost - Cost in USD
 * @property {Object} [metadata] - Provider-specific data
 */

// =============================================================================
// PROVIDER HEALTH & STATUS
// =============================================================================

/**
 * @typedef {Object} ProviderHealth
 * @property {ProviderName} provider - Provider name
 * @property {HealthStatus} status - Overall health status
 * @property {number} latencyMs - API latency
 * @property {Date} checkedAt - When health was checked
 * @property {Object} [services] - Per-service health
 * @property {string} [message] - Status message
 */

// =============================================================================
// PROVIDER INTERFACE CONTRACTS
// =============================================================================

/**
 * Base provider interface - all providers must implement
 * 
 * @typedef {Object} IProvider
 * @property {ProviderName} name - Provider name
 * @property {ProviderCapability} capability - What provider supports
 * @property {() => Promise<ProviderHealth>} getHealth - Check provider health
 * @property {() => Promise<boolean>} isConfigured - Check if API key is set
 */

/**
 * Instance provider interface - for providers that offer GPU instances
 * 
 * @typedef {Object} IInstanceProvider
 * @property {() => Promise<GPUOffering[]>} getGPUOfferings - List available GPUs
 * @property {(config: InstanceConfig) => Promise<Instance>} launchInstance - Launch new instance
 * @property {(instanceId: string) => Promise<Instance>} getInstance - Get instance details
 * @property {() => Promise<Instance[]>} listInstances - List all instances
 * @property {(instanceId: string) => Promise<void>} stopInstance - Stop (pause) instance
 * @property {(instanceId: string) => Promise<void>} startInstance - Resume stopped instance
 * @property {(instanceId: string) => Promise<void>} terminateInstance - Delete instance
 */

/**
 * Serverless provider interface - for providers that offer inference APIs
 * 
 * @typedef {Object} IServerlessProvider
 * @property {() => Promise<ModelOffering[]>} getModels - List available models
 * @property {(modelId: string, input: TextGenerationInput) => Promise<TextGenerationOutput>} generateText - Generate text
 * @property {(modelId: string, input: ImageGenerationInput) => Promise<ImageGenerationOutput>} generateImage - Generate image
 * @property {(modelId: string, input: AudioTranscriptionInput) => Promise<AudioTranscriptionOutput>} transcribeAudio - Transcribe audio
 * @property {(modelId: string, input: EmbeddingInput) => Promise<EmbeddingOutput>} [generateEmbedding] - Generate embeddings
 */

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate savings percentage
 * @param {number} primisPrice - Primis price
 * @param {number} marketPrice - Market price
 * @returns {number} - Savings percentage (0-100)
 */
export function calculateSavings(primisPrice, marketPrice) {
  if (!marketPrice || marketPrice <= 0) return 0
  return Math.round((1 - primisPrice / marketPrice) * 100)
}

/**
 * Normalize GPU name for comparison
 * @param {string} gpuName - GPU name from provider
 * @returns {string} - Normalized name
 */
export function normalizeGPUName(gpuName) {
  return gpuName
    .replace(/^NVIDIA\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/**
 * Create unified GPU offering ID
 * @param {ProviderName} provider - Provider name
 * @param {string} gpuType - GPU type
 * @returns {string} - Unified ID
 */
export function createGPUOfferingId(provider, gpuType) {
  const normalized = normalizeGPUName(gpuType).toLowerCase().replace(/\s+/g, '-')
  return `${provider}-${normalized}`
}

/**
 * Create unified model offering ID
 * @param {ProviderName} provider - Provider name
 * @param {string} modelName - Model name
 * @returns {string} - Unified ID
 */
export function createModelOfferingId(provider, modelName) {
  const normalized = modelName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  return `${provider}-${normalized}`
}

/**
 * Estimate token count from text
 * @param {string} text - Input text
 * @returns {number} - Estimated tokens
 */
export function estimateTokens(text) {
  if (!text) return 0
  // Rough estimate: 1 token ≈ 4 characters for English
  return Math.ceil(text.length / 4)
}

// Export constants for provider names
export const PROVIDERS = {
  RUNPOD: 'runpod',
  TOGETHER: 'together',
  VASTAI: 'vastai',
  LAMBDA: 'lambda'
}

// Export constants for capabilities
export const CAPABILITIES = {
  INSTANCES: 'instances',
  SERVERLESS: 'serverless',
  BOTH: 'both'
}

// Export constants for model categories
export const MODEL_CATEGORIES = {
  TEXT: 'text',
  IMAGE: 'image',
  AUDIO: 'audio',
  EMBEDDING: 'embedding'
}

export default {
  calculateSavings,
  normalizeGPUName,
  createGPUOfferingId,
  createModelOfferingId,
  estimateTokens,
  PROVIDERS,
  CAPABILITIES,
  MODEL_CATEGORIES
}
