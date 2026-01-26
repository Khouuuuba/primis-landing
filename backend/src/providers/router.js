/**
 * Smart Routing Engine
 * 
 * Automatically selects the best provider based on requirements.
 * Features:
 * - Multiple routing strategies (cheapest, fastest, reliable, balanced)
 * - Price caching (60s TTL)
 * - Provider health awareness
 * - GPU and model recommendations
 */

import { PROVIDERS, MODEL_CATEGORIES } from './types.js'

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

const CACHE_TTL_MS = 60 * 1000 // 60 seconds
const cache = {
  gpuOfferings: { data: null, timestamp: 0 },
  modelOfferings: { data: null, timestamp: 0 },
  providerHealth: { data: null, timestamp: 0 }
}

/**
 * Check if cache is valid
 */
function isCacheValid(cacheEntry) {
  return cacheEntry.data && (Date.now() - cacheEntry.timestamp) < CACHE_TTL_MS
}

/**
 * Get cached data or fetch fresh
 */
async function getCachedOrFetch(cacheKey, fetchFn) {
  if (isCacheValid(cache[cacheKey])) {
    return cache[cacheKey].data
  }
  
  const data = await fetchFn()
  cache[cacheKey] = { data, timestamp: Date.now() }
  return data
}

/**
 * Invalidate all caches
 */
export function invalidateCache() {
  Object.keys(cache).forEach(key => {
    cache[key] = { data: null, timestamp: 0 }
  })
}

// =============================================================================
// ROUTING STRATEGIES
// =============================================================================

/**
 * @typedef {'cheapest' | 'fastest' | 'reliable' | 'balanced' | 'value'} RoutingStrategy
 */

/**
 * Strategy weights for scoring
 */
const STRATEGY_WEIGHTS = {
  cheapest: { price: 0.7, savings: 0.2, reliability: 0.1 },
  fastest: { availability: 0.5, reliability: 0.3, price: 0.2 },
  reliable: { reliability: 0.6, price: 0.2, availability: 0.2 },
  balanced: { price: 0.35, reliability: 0.35, savings: 0.15, availability: 0.15 },
  value: { savings: 0.5, price: 0.3, reliability: 0.2 }
}

// =============================================================================
// SCORING FUNCTIONS
// =============================================================================

/**
 * Calculate normalized price score (lower price = higher score)
 * @param {number} price - Price per hour/unit
 * @param {number} maxPrice - Maximum price in dataset
 * @returns {number} - Score 0-1
 */
function calculatePriceScore(price, maxPrice) {
  if (maxPrice <= 0) return 1
  return Math.max(0, 1 - (price / maxPrice))
}

/**
 * Calculate savings score
 * @param {number} savings - Savings percentage (0-100)
 * @returns {number} - Score 0-1
 */
function calculateSavingsScore(savings) {
  return Math.min((savings || 0) / 50, 1) // 50%+ savings = max score
}

/**
 * Calculate reliability score
 * @param {number} reliability - Reliability 0-1
 * @returns {number} - Score 0-1
 */
function calculateReliabilityScore(reliability) {
  return reliability || 0.7 // Default to 0.7 if not specified
}

/**
 * Calculate availability score
 * @param {boolean} available - Whether currently available
 * @param {Object} providerHealth - Provider health status
 * @returns {number} - Score 0-1
 */
function calculateAvailabilityScore(available, providerHealth) {
  if (!available) return 0
  if (!providerHealth) return 0.5
  
  switch (providerHealth.status) {
    case 'healthy': return 1.0
    case 'degraded': return 0.6
    case 'unavailable': return 0.2
    default: return 0.5
  }
}

/**
 * Calculate overall score for a GPU offering
 */
function scoreGPUOffering(offering, strategy, context) {
  const weights = STRATEGY_WEIGHTS[strategy] || STRATEGY_WEIGHTS.balanced
  const { maxPrice, providerHealth } = context
  
  const scores = {
    price: calculatePriceScore(offering.pricePerHour, maxPrice),
    savings: calculateSavingsScore(offering.savings),
    reliability: calculateReliabilityScore(offering.reliability),
    availability: calculateAvailabilityScore(offering.available, providerHealth?.[offering.provider])
  }
  
  // Calculate weighted score
  let totalScore = 0
  let totalWeight = 0
  
  for (const [factor, weight] of Object.entries(weights)) {
    if (scores[factor] !== undefined) {
      totalScore += scores[factor] * weight
      totalWeight += weight
    }
  }
  
  return {
    score: totalWeight > 0 ? totalScore / totalWeight : 0,
    breakdown: scores
  }
}

/**
 * Calculate overall score for a model offering
 */
function scoreModelOffering(model, strategy, context) {
  const weights = STRATEGY_WEIGHTS[strategy] || STRATEGY_WEIGHTS.cheapest
  const { maxPrice, providerHealth } = context
  
  const scores = {
    price: calculatePriceScore(model.inputPrice, maxPrice),
    reliability: calculateReliabilityScore(0.9), // Models are generally reliable
    availability: calculateAvailabilityScore(model.available, providerHealth?.[model.provider])
  }
  
  // Bonus for streaming support
  if (model.streaming) {
    scores.reliability += 0.05
  }
  
  // Bonus for larger context
  if (model.contextLength && model.contextLength > 32000) {
    scores.reliability += 0.05
  }
  
  let totalScore = 0
  let totalWeight = 0
  
  for (const [factor, weight] of Object.entries(weights)) {
    if (scores[factor] !== undefined) {
      totalScore += scores[factor] * weight
      totalWeight += weight
    }
  }
  
  return {
    score: totalWeight > 0 ? totalScore / totalWeight : 0,
    breakdown: scores
  }
}

// =============================================================================
// SMART ROUTING FUNCTIONS
// =============================================================================

/**
 * Get smart GPU recommendations
 * 
 * @param {Object} requirements
 * @param {number} [requirements.minVram] - Minimum VRAM in GB
 * @param {number} [requirements.maxVram] - Maximum VRAM in GB
 * @param {string[]} [requirements.gpuTypes] - Acceptable GPU types
 * @param {number} [requirements.maxPrice] - Maximum price per hour
 * @param {string[]} [requirements.preferredProviders] - Preferred providers (prioritized)
 * @param {string[]} [requirements.excludeProviders] - Providers to exclude
 * @param {RoutingStrategy} [requirements.strategy='balanced'] - Routing strategy
 * @param {number} [requirements.limit=10] - Max results to return
 * @param {Function} getAllGPUOfferings - Function to get all GPU offerings
 * @param {Function} getAllProviderHealth - Function to get provider health
 * @returns {Promise<Object>} - Recommendations with metadata
 */
export async function getGPURecommendations(requirements, getAllGPUOfferings, getAllProviderHealth) {
  const {
    minVram = 0,
    maxVram = Infinity,
    gpuTypes = [],
    maxPrice = Infinity,
    preferredProviders = [],
    excludeProviders = [],
    strategy = 'balanced',
    limit = 10
  } = requirements

  // Get cached offerings
  const offerings = await getCachedOrFetch('gpuOfferings', getAllGPUOfferings)
  
  // Get provider health (with shorter cache)
  let providerHealth = {}
  try {
    const healthData = await getCachedOrFetch('providerHealth', getAllProviderHealth)
    healthData.forEach(h => { providerHealth[h.provider] = h })
  } catch (e) {
    console.warn('Could not fetch provider health:', e.message)
  }

  // Filter offerings
  let filtered = offerings.filter(offering => {
    if (offering.vramGb < minVram) return false
    if (offering.vramGb > maxVram) return false
    if (offering.pricePerHour > maxPrice) return false
    if (excludeProviders.includes(offering.provider)) return false
    if (gpuTypes.length > 0 && !gpuTypes.some(t => 
      offering.gpuType.toUpperCase().includes(t.toUpperCase())
    )) return false
    return true
  })

  // Calculate context for scoring
  const context = {
    maxPrice: Math.max(...filtered.map(o => o.pricePerHour), 1),
    providerHealth
  }

  // Score and sort
  let scored = filtered.map(offering => {
    const { score, breakdown } = scoreGPUOffering(offering, strategy, context)
    
    // Boost score for preferred providers
    let finalScore = score
    if (preferredProviders.includes(offering.provider)) {
      finalScore *= 1.15 // 15% boost
    }
    
    return {
      ...offering,
      score: Math.round(finalScore * 100) / 100,
      scoreBreakdown: breakdown,
      isRecommended: false
    }
  })

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  // Mark top recommendation
  if (scored.length > 0) {
    scored[0].isRecommended = true
  }

  // Calculate stats
  const availableCount = scored.filter(s => s.available).length
  const priceRange = scored.length > 0 ? {
    min: Math.min(...scored.map(s => s.pricePerHour)),
    max: Math.max(...scored.map(s => s.pricePerHour)),
    avg: scored.reduce((sum, s) => sum + s.pricePerHour, 0) / scored.length
  } : null

  return {
    recommendations: scored.slice(0, limit),
    total: scored.length,
    available: availableCount,
    strategy,
    priceRange,
    providers: [...new Set(scored.map(s => s.provider))],
    cached: isCacheValid(cache.gpuOfferings),
    timestamp: new Date().toISOString()
  }
}

/**
 * Get smart model recommendations
 * 
 * @param {Object} requirements
 * @param {string} requirements.category - Model category (text, image, audio, embedding)
 * @param {number} [requirements.maxCost] - Maximum cost per unit
 * @param {number} [requirements.minContext] - Minimum context length (for text)
 * @param {boolean} [requirements.streaming] - Require streaming support
 * @param {string[]} [requirements.preferredProviders] - Preferred providers
 * @param {string[]} [requirements.excludeProviders] - Providers to exclude
 * @param {RoutingStrategy} [requirements.strategy='cheapest'] - Routing strategy
 * @param {number} [requirements.limit=10] - Max results
 * @param {Function} getAllModelOfferings - Function to get all model offerings
 * @param {Function} getAllProviderHealth - Function to get provider health
 * @returns {Promise<Object>} - Recommendations with metadata
 */
export async function getModelRecommendations(requirements, getAllModelOfferings, getAllProviderHealth) {
  const {
    category,
    maxCost = Infinity,
    minContext = 0,
    streaming = false,
    preferredProviders = [],
    excludeProviders = [],
    strategy = 'cheapest',
    limit = 10
  } = requirements

  if (!category) {
    throw new Error('Model category is required')
  }

  // Get cached offerings
  const offerings = await getCachedOrFetch('modelOfferings', getAllModelOfferings)
  
  // Get provider health
  let providerHealth = {}
  try {
    const healthData = await getCachedOrFetch('providerHealth', getAllProviderHealth)
    healthData.forEach(h => { providerHealth[h.provider] = h })
  } catch (e) {
    console.warn('Could not fetch provider health:', e.message)
  }

  // Filter offerings
  let filtered = offerings.filter(model => {
    if (model.category !== category) return false
    if (model.inputPrice > maxCost) return false
    if (excludeProviders.includes(model.provider)) return false
    if (streaming && !model.streaming) return false
    if (minContext > 0 && (model.contextLength || 0) < minContext) return false
    return true
  })

  // Calculate context for scoring
  const context = {
    maxPrice: Math.max(...filtered.map(m => m.inputPrice), 1),
    providerHealth
  }

  // Score and sort
  let scored = filtered.map(model => {
    const { score, breakdown } = scoreModelOffering(model, strategy, context)
    
    // Boost for preferred providers
    let finalScore = score
    if (preferredProviders.includes(model.provider)) {
      finalScore *= 1.15
    }
    
    return {
      ...model,
      score: Math.round(finalScore * 100) / 100,
      scoreBreakdown: breakdown,
      isRecommended: false
    }
  })

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  // Mark top recommendation
  if (scored.length > 0) {
    scored[0].isRecommended = true
  }

  // Calculate stats
  const availableCount = scored.filter(s => s.available).length

  return {
    recommendations: scored.slice(0, limit),
    total: scored.length,
    available: availableCount,
    category,
    strategy,
    providers: [...new Set(scored.map(s => s.provider))],
    cached: isCacheValid(cache.modelOfferings),
    timestamp: new Date().toISOString()
  }
}

/**
 * Get quick recommendation for a use case
 * 
 * @param {string} useCase - Use case identifier
 * @param {Function} getAllGPUOfferings
 * @param {Function} getAllModelOfferings
 * @param {Function} getAllProviderHealth
 * @returns {Promise<Object>} - Quick recommendation
 */
export async function getQuickRecommendation(useCase, getAllGPUOfferings, getAllModelOfferings, getAllProviderHealth) {
  const useCaseConfigs = {
    // GPU use cases
    'inference-small': { type: 'gpu', minVram: 8, maxPrice: 0.5, strategy: 'cheapest' },
    'inference-medium': { type: 'gpu', minVram: 16, maxPrice: 1.0, strategy: 'balanced' },
    'inference-large': { type: 'gpu', minVram: 24, maxPrice: 2.0, strategy: 'balanced' },
    'training-small': { type: 'gpu', minVram: 24, maxPrice: 1.5, strategy: 'value' },
    'training-large': { type: 'gpu', minVram: 48, maxPrice: 3.0, strategy: 'reliable' },
    'training-enterprise': { type: 'gpu', minVram: 80, strategy: 'reliable' },
    
    // Model use cases
    'chat-fast': { type: 'model', category: 'text', maxCost: 0.5, strategy: 'cheapest' },
    'chat-quality': { type: 'model', category: 'text', minContext: 32000, strategy: 'balanced' },
    'coding': { type: 'model', category: 'text', minContext: 16000, strategy: 'balanced' },
    'embedding': { type: 'model', category: 'embedding', strategy: 'cheapest' },
    'image-gen': { type: 'model', category: 'image', strategy: 'cheapest' },
    'transcription': { type: 'model', category: 'audio', strategy: 'cheapest' }
  }

  const config = useCaseConfigs[useCase]
  if (!config) {
    throw new Error(`Unknown use case: ${useCase}. Available: ${Object.keys(useCaseConfigs).join(', ')}`)
  }

  if (config.type === 'gpu') {
    const result = await getGPURecommendations(
      { ...config, limit: 3 },
      getAllGPUOfferings,
      getAllProviderHealth
    )
    return {
      useCase,
      type: 'gpu',
      recommendation: result.recommendations[0] || null,
      alternatives: result.recommendations.slice(1),
      total: result.total
    }
  } else {
    const result = await getModelRecommendations(
      { ...config, limit: 3 },
      getAllModelOfferings,
      getAllProviderHealth
    )
    return {
      useCase,
      type: 'model',
      recommendation: result.recommendations[0] || null,
      alternatives: result.recommendations.slice(1),
      total: result.total
    }
  }
}

/**
 * Compare prices across providers for same GPU/model
 * 
 * @param {string} gpuType - GPU type to compare
 * @param {Function} getAllGPUOfferings
 * @returns {Promise<Object>} - Price comparison
 */
export async function comparePrices(gpuType, getAllGPUOfferings) {
  const offerings = await getCachedOrFetch('gpuOfferings', getAllGPUOfferings)
  
  // Find matching GPUs across providers
  const normalized = gpuType.toUpperCase()
  const matching = offerings.filter(o => 
    o.gpuType.toUpperCase().includes(normalized)
  )

  if (matching.length === 0) {
    return { found: false, gpuType, message: 'No matching GPUs found' }
  }

  // Group by provider
  const byProvider = {}
  matching.forEach(o => {
    if (!byProvider[o.provider] || o.pricePerHour < byProvider[o.provider].pricePerHour) {
      byProvider[o.provider] = o
    }
  })

  const providers = Object.entries(byProvider)
    .map(([provider, offering]) => ({
      provider,
      pricePerHour: offering.pricePerHour,
      marketPrice: offering.marketPrice,
      savings: offering.savings,
      available: offering.available
    }))
    .sort((a, b) => a.pricePerHour - b.pricePerHour)

  const cheapest = providers[0]
  const mostExpensive = providers[providers.length - 1]
  const savingsVsMax = cheapest && mostExpensive 
    ? Math.round((1 - cheapest.pricePerHour / mostExpensive.pricePerHour) * 100)
    : 0

  return {
    found: true,
    gpuType,
    providers,
    cheapest: cheapest?.provider,
    savingsVsMax,
    recommendation: `Use ${cheapest?.provider} to save ${savingsVsMax}%`
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  getGPURecommendations,
  getModelRecommendations,
  getQuickRecommendation,
  comparePrices,
  invalidateCache,
  STRATEGY_WEIGHTS
}
