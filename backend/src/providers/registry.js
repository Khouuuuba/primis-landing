/**
 * Provider Registry
 * 
 * Central registry for all GPU and serverless providers.
 * Handles provider discovery, health checking, and aggregation.
 */

import { PROVIDERS, CAPABILITIES, calculateSavings } from './types.js'
import RunPodInstanceProvider from './runpod-instances.js'
import RunPodServerlessProvider from './runpod-serverless.js'
import TogetherAiProvider from './together-provider.js'
import VastAiProvider from './vastai-provider.js'
import LambdaProvider from './lambda-provider.js'

// =============================================================================
// PROVIDER REGISTRY
// =============================================================================

/**
 * Registry of all available providers
 */
const providers = {
  instances: {
    [PROVIDERS.RUNPOD]: RunPodInstanceProvider,
    [PROVIDERS.VASTAI]: VastAiProvider,
    [PROVIDERS.LAMBDA]: LambdaProvider,  // Premium tier
  },
  serverless: {
    [PROVIDERS.RUNPOD]: RunPodServerlessProvider,
    [PROVIDERS.TOGETHER]: TogetherAiProvider,
  }
}

/**
 * Get an instance provider by name
 * @param {string} name - Provider name
 * @returns {IInstanceProvider|null}
 */
export function getInstanceProvider(name) {
  return providers.instances[name] || null
}

/**
 * Get a serverless provider by name
 * @param {string} name - Provider name
 * @returns {IServerlessProvider|null}
 */
export function getServerlessProvider(name) {
  return providers.serverless[name] || null
}

/**
 * Get all configured instance providers
 * @returns {Promise<IInstanceProvider[]>}
 */
export async function getConfiguredInstanceProviders() {
  const configured = []
  
  for (const [name, provider] of Object.entries(providers.instances)) {
    if (await provider.isConfigured()) {
      configured.push(provider)
    }
  }
  
  return configured
}

/**
 * Get all configured serverless providers
 * @returns {Promise<IServerlessProvider[]>}
 */
export async function getConfiguredServerlessProviders() {
  const configured = []
  
  for (const [name, provider] of Object.entries(providers.serverless)) {
    if (await provider.isConfigured()) {
      configured.push(provider)
    }
  }
  
  return configured
}

// =============================================================================
// AGGREGATION FUNCTIONS
// =============================================================================

/**
 * Get all GPU offerings from ALL providers (not just configured ones)
 * GPUs from unconfigured providers will have available: false
 * @returns {Promise<GPUOffering[]>}
 */
export async function getAllGPUOfferings() {
  // Get ALL instance providers, not just configured ones
  const allInstanceProviders = Object.values(providers.instances)
  
  const allOfferings = await Promise.all(
    allInstanceProviders.map(async provider => {
      try {
        return await provider.getGPUOfferings()
      } catch (error) {
        console.error(`Failed to get offerings from ${provider.name}:`, error.message)
        return []
      }
    })
  )
  
  // Flatten and sort by price
  return allOfferings
    .flat()
    .sort((a, b) => a.pricePerHour - b.pricePerHour)
}

/**
 * Get all model offerings from ALL providers (not just configured ones)
 * Models from unconfigured providers will have available: false
 * @returns {Promise<ModelOffering[]>}
 */
export async function getAllModelOfferings() {
  // Get ALL serverless providers, not just configured ones
  const allServerlessProviders = Object.values(providers.serverless)
  
  const allOfferings = await Promise.all(
    allServerlessProviders.map(async provider => {
      try {
        return await provider.getModels()
      } catch (error) {
        console.error(`Failed to get models from ${provider.name}:`, error.message)
        return []
      }
    })
  )
  
  // Flatten and group by category
  return allOfferings.flat()
}

/**
 * Get health status of all providers
 * @returns {Promise<ProviderHealth[]>}
 */
export async function getAllProviderHealth() {
  const allProviders = [
    ...Object.values(providers.instances),
    ...Object.values(providers.serverless)
  ]
  
  // Deduplicate (RunPod appears in both)
  const uniqueProviders = [...new Map(allProviders.map(p => [p.name, p])).values()]
  
  return Promise.all(
    uniqueProviders.map(provider => provider.getHealth())
  )
}

// =============================================================================
// SMART ROUTING (Preparation for Phase 5.5)
// =============================================================================

/**
 * Routing strategy types
 * @typedef {'cheapest' | 'fastest' | 'reliable' | 'balanced'} RoutingStrategy
 */

/**
 * Find best GPU offering based on requirements
 * @param {Object} requirements
 * @param {number} [requirements.minVram] - Minimum VRAM in GB
 * @param {string[]} [requirements.gpuTypes] - Acceptable GPU types
 * @param {number} [requirements.maxPrice] - Maximum price per hour
 * @param {string[]} [requirements.excludeProviders] - Providers to exclude
 * @param {RoutingStrategy} [requirements.strategy='cheapest'] - Routing strategy
 * @returns {Promise<GPUOffering[]>} - Sorted recommendations
 */
export async function findBestGPU(requirements = {}) {
  const {
    minVram = 0,
    gpuTypes = [],
    maxPrice = Infinity,
    excludeProviders = [],
    strategy = 'cheapest'
  } = requirements

  let offerings = await getAllGPUOfferings()

  // Filter by requirements
  offerings = offerings.filter(offering => {
    if (offering.vramGb < minVram) return false
    if (offering.pricePerHour > maxPrice) return false
    if (excludeProviders.includes(offering.provider)) return false
    if (gpuTypes.length > 0 && !gpuTypes.some(t => 
      offering.gpuType.toUpperCase().includes(t.toUpperCase())
    )) return false
    if (!offering.available) return false
    return true
  })

  // Score and sort based on strategy
  offerings = offerings.map(offering => ({
    ...offering,
    score: calculateScore(offering, strategy)
  }))

  return offerings.sort((a, b) => b.score - a.score)
}

/**
 * Calculate score for an offering based on strategy
 */
function calculateScore(offering, strategy) {
  const priceScore = 1 - (offering.pricePerHour / 5) // Normalize to 0-1 (max $5/hr)
  const reliabilityScore = offering.reliability || 0.8
  const savingsScore = (offering.savings || 0) / 100

  switch (strategy) {
    case 'cheapest':
      return priceScore * 0.7 + savingsScore * 0.3
    case 'reliable':
      return reliabilityScore * 0.7 + priceScore * 0.3
    case 'balanced':
      return priceScore * 0.4 + reliabilityScore * 0.4 + savingsScore * 0.2
    default:
      return priceScore
  }
}

/**
 * Find best model for a task
 * @param {Object} requirements
 * @param {string} requirements.category - Model category (text, image, audio)
 * @param {number} [requirements.maxCost] - Maximum cost per unit
 * @param {string[]} [requirements.excludeProviders] - Providers to exclude
 * @returns {Promise<ModelOffering[]>} - Sorted recommendations
 */
export async function findBestModel(requirements) {
  const {
    category,
    maxCost = Infinity,
    excludeProviders = []
  } = requirements

  let models = await getAllModelOfferings()

  // Filter by requirements
  models = models.filter(model => {
    if (model.category !== category) return false
    if (model.inputPrice > maxCost) return false
    if (excludeProviders.includes(model.provider)) return false
    if (!model.available) return false
    return true
  })

  // Sort by price
  return models.sort((a, b) => a.inputPrice - b.inputPrice)
}

// =============================================================================
// PROVIDER OPERATIONS
// =============================================================================

/**
 * Launch instance using the best available provider
 * @param {InstanceConfig} config
 * @param {Object} [options]
 * @param {string} [options.preferredProvider] - Prefer specific provider
 * @returns {Promise<Instance>}
 */
export async function launchInstance(config, options = {}) {
  const { preferredProvider } = options

  // If provider specified in config, use that
  if (config.gpuOfferingId) {
    const providerName = config.gpuOfferingId.split('-')[0]
    const provider = getInstanceProvider(providerName)
    
    if (provider && await provider.isConfigured()) {
      return provider.launchInstance(config)
    }
  }

  // If preferred provider specified
  if (preferredProvider) {
    const provider = getInstanceProvider(preferredProvider)
    if (provider && await provider.isConfigured()) {
      return provider.launchInstance(config)
    }
  }

  // Default to first configured provider
  const configuredProviders = await getConfiguredInstanceProviders()
  if (configuredProviders.length === 0) {
    throw new Error('No instance providers configured')
  }

  return configuredProviders[0].launchInstance(config)
}

/**
 * Get instance from any provider
 * @param {string} instanceId
 * @param {string} provider - Provider name
 * @returns {Promise<Instance>}
 */
export async function getInstance(instanceId, providerName) {
  const provider = getInstanceProvider(providerName)
  if (!provider) {
    throw new Error(`Unknown provider: ${providerName}`)
  }
  return provider.getInstance(instanceId)
}

/**
 * Stop instance
 * @param {string} instanceId
 * @param {string} provider - Provider name
 */
export async function stopInstance(instanceId, providerName) {
  const provider = getInstanceProvider(providerName)
  if (!provider) {
    throw new Error(`Unknown provider: ${providerName}`)
  }
  return provider.stopInstance(instanceId)
}

/**
 * Terminate instance
 * @param {string} instanceId
 * @param {string} provider - Provider name
 */
export async function terminateInstance(instanceId, providerName) {
  const provider = getInstanceProvider(providerName)
  if (!provider) {
    throw new Error(`Unknown provider: ${providerName}`)
  }
  return provider.terminateInstance(instanceId)
}

// =============================================================================
// SERVERLESS OPERATIONS
// =============================================================================

/**
 * Generate text using best available provider
 * @param {string} modelId - Model offering ID
 * @param {TextGenerationInput} input
 * @returns {Promise<TextGenerationOutput>}
 */
export async function generateText(modelId, input) {
  const providerName = modelId.split('-')[0]
  const provider = getServerlessProvider(providerName)
  
  if (!provider) {
    throw new Error(`Unknown provider for model: ${modelId}`)
  }
  
  return provider.generateText(modelId, input)
}

/**
 * Generate image using best available provider
 * @param {string} modelId - Model offering ID
 * @param {ImageGenerationInput} input
 * @returns {Promise<ImageGenerationOutput>}
 */
export async function generateImage(modelId, input) {
  const providerName = modelId.split('-')[0]
  const provider = getServerlessProvider(providerName)
  
  if (!provider) {
    throw new Error(`Unknown provider for model: ${modelId}`)
  }
  
  return provider.generateImage(modelId, input)
}

/**
 * Transcribe audio using best available provider
 * @param {string} modelId - Model offering ID
 * @param {AudioTranscriptionInput} input
 * @returns {Promise<AudioTranscriptionOutput>}
 */
export async function transcribeAudio(modelId, input) {
  const providerName = modelId.split('-')[0]
  const provider = getServerlessProvider(providerName)
  
  if (!provider) {
    throw new Error(`Unknown provider for model: ${modelId}`)
  }
  
  return provider.transcribeAudio(modelId, input)
}

/**
 * Generate embeddings using best available provider
 * @param {string} modelId - Model offering ID
 * @param {EmbeddingInput} input
 * @returns {Promise<EmbeddingOutput>}
 */
export async function generateEmbedding(modelId, input) {
  const providerName = modelId.split('-')[0]
  const provider = getServerlessProvider(providerName)
  
  if (!provider) {
    throw new Error(`Unknown provider for model: ${modelId}`)
  }
  
  if (!provider.generateEmbedding) {
    throw new Error(`Provider ${providerName} does not support embeddings`)
  }
  
  return provider.generateEmbedding(modelId, input)
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Provider access
  getInstanceProvider,
  getServerlessProvider,
  getConfiguredInstanceProviders,
  getConfiguredServerlessProviders,
  
  // Aggregation
  getAllGPUOfferings,
  getAllModelOfferings,
  getAllProviderHealth,
  
  // Smart routing
  findBestGPU,
  findBestModel,
  
  // Operations
  launchInstance,
  getInstance,
  stopInstance,
  terminateInstance,
  generateText,
  generateImage,
  transcribeAudio,
  generateEmbedding
}
