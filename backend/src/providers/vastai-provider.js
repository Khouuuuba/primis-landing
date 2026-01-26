/**
 * Vast.ai Instance Provider Adapter
 * 
 * Implements IInstanceProvider interface for Vast.ai GPU marketplace.
 * Vast.ai offers the cheapest GPU rentals via a marketplace model.
 * 
 * API Reference: https://vast.ai/docs/
 * Base URL: https://cloud.vast.ai/api/v0/
 */

import { 
  PROVIDERS, 
  CAPABILITIES, 
  createGPUOfferingId, 
  calculateSavings,
  normalizeGPUName 
} from './types.js'

// Lazy getter for API key (checked at runtime, not module load time)
const getApiKey = () => process.env.VASTAI_API_KEY
const VASTAI_BASE_URL = 'https://cloud.vast.ai/api/v0'

// Primis discount rate (25% below Vast.ai's already low prices)
const PRIMIS_DISCOUNT = 0.85

// GPU type mapping for normalization
const GPU_VRAM_MAP = {
  'RTX 4090': 24,
  'RTX 4080': 16,
  'RTX 4070 TI': 12,
  'RTX 3090': 24,
  'RTX 3090 TI': 24,
  'RTX 3080': 10,
  'RTX 3080 TI': 12,
  'RTX 3070': 8,
  'RTX A6000': 48,
  'RTX A5000': 24,
  'RTX A4000': 16,
  'A100 PCIE': 40,
  'A100 SXM': 80,
  'A100 80GB': 80,
  'A40': 48,
  'L40': 48,
  'H100 PCIE': 80,
  'H100 SXM': 80,
  'V100': 16,
  'V100 32GB': 32,
  'A10': 24,
  'A30': 24,
  'T4': 16,
}

/**
 * Make API request to Vast.ai
 */
async function vastaiRequest(endpoint, method = 'GET', body = null) {
  if (!getApiKey()) {
    throw new Error('getApiKey() not configured')
  }

  const options = {
    method,
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`
    }
  }

  if (body) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  const response = await fetch(`${VASTAI_BASE_URL}${endpoint}`, options)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Vast.ai API error: ${response.status} - ${error}`)
  }

  return response.json()
}

/**
 * Map Vast.ai status to unified status
 */
function mapStatus(vastaiStatus) {
  const statusMap = {
    'running': 'running',
    'loading': 'pending',
    'created': 'pending',
    'exited': 'stopped',
    'inactive': 'stopped',
    'destroyed': 'terminated'
  }
  return statusMap[vastaiStatus] || 'pending'
}

/**
 * Get VRAM for GPU type
 */
function getGPUVram(gpuName) {
  const normalized = normalizeGPUName(gpuName)
  for (const [key, vram] of Object.entries(GPU_VRAM_MAP)) {
    if (normalized.includes(key.toUpperCase())) {
      return vram
    }
  }
  return 24 // Default assumption
}

/**
 * Calculate reliability score based on Vast.ai metrics
 */
function calculateReliability(offer) {
  let score = 0.7 // Base score
  
  // Host reliability affects score
  if (offer.reliability2 > 0.99) score += 0.15
  else if (offer.reliability2 > 0.95) score += 0.10
  else if (offer.reliability2 > 0.90) score += 0.05
  
  // Verification status
  if (offer.verified) score += 0.10
  
  // Internet speed
  if (offer.inet_up > 500 && offer.inet_down > 500) score += 0.05
  
  return Math.min(score, 1.0)
}

// =============================================================================
// VAST.AI INSTANCE PROVIDER
// =============================================================================

/**
 * Vast.ai Instance Provider
 * @implements {IInstanceProvider}
 */
const VastAiProvider = {
  name: PROVIDERS.VASTAI,
  capability: CAPABILITIES.INSTANCES,

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
          provider: PROVIDERS.VASTAI,
          status: 'unavailable',
          latencyMs: 0,
          checkedAt: new Date(),
          message: 'API key not configured'
        }
      }

      // Quick health check - list offers (simple query, no filters)
      const response = await fetch(`${VASTAI_BASE_URL}/bundles/?limit=1`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${getApiKey()}`
        }
      })

      const latencyMs = Date.now() - startTime

      return {
        provider: PROVIDERS.VASTAI,
        status: response.ok ? 'healthy' : 'degraded',
        latencyMs,
        checkedAt: new Date(),
        message: response.ok ? 'Connected' : `HTTP ${response.status}`
      }
    } catch (error) {
      return {
        provider: PROVIDERS.VASTAI,
        status: 'unavailable',
        latencyMs: Date.now() - startTime,
        checkedAt: new Date(),
        message: error.message
      }
    }
  },

  /**
   * List available GPU offerings
   * @returns {Promise<GPUOffering[]>}
   */
  async getGPUOfferings() {
    // Return static catalog when not configured
    if (!getApiKey()) {
      return this.getStaticGPUCatalog()
    }

    try {
      // Query Vast.ai for RENTABLE offers only
      // CRITICAL: Filter rentable=true to only show actually available machines
      // Sort by price ascending, limit to 200 offers
      const data = await vastaiRequest(`/bundles/?q=%7B%22rentable%22%3A%7B%22eq%22%3Atrue%7D%7D&order=[[%22dph_total%22,%22asc%22]]&limit=200`)
      const offers = data.offers || []

      // Group by GPU type and get cheapest RENTABLE offer for each
      const gpuMap = new Map()
      
      offers.forEach(offer => {
        // Double-check rentable flag (belt and suspenders)
        if (!offer.rentable) return
        
        const gpuName = offer.gpu_name || 'Unknown GPU'
        const normalized = normalizeGPUName(gpuName)
        
        if (!gpuMap.has(normalized) || offer.dph_total < gpuMap.get(normalized).dph_total) {
          gpuMap.set(normalized, offer)
        }
      })

      return Array.from(gpuMap.values()).map(offer => {
        const vastPrice = offer.dph_total || 0
        const primisPrice = vastPrice * PRIMIS_DISCOUNT
        const vram = getGPUVram(offer.gpu_name)

        return {
          id: createGPUOfferingId(PROVIDERS.VASTAI, offer.gpu_name),
          provider: PROVIDERS.VASTAI,
          gpuType: offer.gpu_name,
          vramGb: vram,
          gpuCount: offer.num_gpus || 1,
          pricePerHour: primisPrice,
          marketPrice: vastPrice,
          available: true,
          region: offer.geolocation || 'Unknown',
          reliability: calculateReliability(offer),
          savings: calculateSavings(primisPrice, vastPrice),
          metadata: {
            vastaiOfferId: offer.id,
            hostId: offer.machine_id,
            cudaVersion: offer.cuda_max_good,
            diskSpace: offer.disk_space,
            ramGb: Math.round((offer.cpu_ram || 0) / 1024),
            cpuCores: offer.cpu_cores,
            verified: offer.verified,
            reliability2: offer.reliability2
          }
        }
      }).sort((a, b) => a.pricePerHour - b.pricePerHour)
    } catch (error) {
      console.error('Failed to fetch Vast.ai offerings:', error.message)
      return this.getStaticGPUCatalog()
    }
  },

  /**
   * Get static GPU catalog (when API not available)
   */
  getStaticGPUCatalog() {
    // Approximate Vast.ai pricing (as of 2025)
    const catalog = [
      { gpu: 'RTX 4090', vram: 24, vastPrice: 0.35, reliability: 0.85 },
      { gpu: 'RTX 3090', vram: 24, vastPrice: 0.22, reliability: 0.80 },
      { gpu: 'RTX 3080', vram: 10, vastPrice: 0.15, reliability: 0.80 },
      { gpu: 'RTX 3070', vram: 8, vastPrice: 0.12, reliability: 0.75 },
      { gpu: 'RTX A6000', vram: 48, vastPrice: 0.55, reliability: 0.90 },
      { gpu: 'RTX A5000', vram: 24, vastPrice: 0.35, reliability: 0.85 },
      { gpu: 'A100 80GB', vram: 80, vastPrice: 1.20, reliability: 0.90 },
      { gpu: 'A100 40GB', vram: 40, vastPrice: 0.85, reliability: 0.90 },
      { gpu: 'H100 80GB', vram: 80, vastPrice: 2.50, reliability: 0.95 },
      { gpu: 'A40', vram: 48, vastPrice: 0.45, reliability: 0.85 },
      { gpu: 'L40', vram: 48, vastPrice: 0.65, reliability: 0.90 },
      { gpu: 'V100 32GB', vram: 32, vastPrice: 0.35, reliability: 0.85 },
      { gpu: 'T4', vram: 16, vastPrice: 0.10, reliability: 0.80 },
    ]

    return catalog.map(item => ({
      id: createGPUOfferingId(PROVIDERS.VASTAI, item.gpu),
      provider: PROVIDERS.VASTAI,
      gpuType: item.gpu,
      vramGb: item.vram,
      gpuCount: 1,
      pricePerHour: item.vastPrice * PRIMIS_DISCOUNT,
      marketPrice: item.vastPrice,
      available: false, // Not available without API key
      reliability: item.reliability,
      savings: calculateSavings(item.vastPrice * PRIMIS_DISCOUNT, item.vastPrice),
      metadata: {
        isStatic: true,
        note: 'Pricing is approximate. Connect API key for live pricing.'
      }
    }))
  },

  /**
   * Launch a new GPU instance
   * @param {InstanceConfig} config
   * @returns {Promise<Instance>}
   */
  async launchInstance(config) {
    const { 
      name, 
      gpuOfferingId, 
      image = 'pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime',
      volumeGb = 20,
      env = {}
    } = config

    if (!getApiKey()) {
      throw new Error('Vast.ai API key not configured')
    }

    // Extract GPU type from offering ID (e.g., "vastai-rtx-3090" -> "RTX 3090")
    const gpuTypeFromId = gpuOfferingId
      .replace('vastai-', '')
      .toUpperCase()
      .replace(/-/g, ' ')

    // Fetch FRESH RENTABLE offers at launch time (Vast.ai marketplace changes rapidly)
    // CRITICAL: Filter for rentable=true, otherwise we get unavailable/rented machines
    console.log(`Vast.ai: Fetching fresh RENTABLE offers for GPU type: ${gpuTypeFromId}`)
    
    const freshData = await vastaiRequest(`/bundles/?q=%7B%22rentable%22%3A%7B%22eq%22%3Atrue%7D%7D&order=[[%22dph_total%22,%22asc%22]]&limit=100`)
    const freshOffers = freshData.offers || []
    
    // Find matching offers for the requested GPU type
    const matchingOffers = freshOffers.filter(offer => {
      const offerGpuName = normalizeGPUName(offer.gpu_name || '')
      const requestedGpu = normalizeGPUName(gpuTypeFromId)
      return offerGpuName.includes(requestedGpu) || requestedGpu.includes(offerGpuName)
    })

    if (matchingOffers.length === 0) {
      // Try a more flexible match
      const flexibleMatches = freshOffers.filter(offer => {
        const offerGpu = (offer.gpu_name || '').toUpperCase()
        const parts = gpuTypeFromId.split(' ')
        return parts.every(part => offerGpu.includes(part))
      })
      
      if (flexibleMatches.length === 0) {
        throw new Error(`No Vast.ai offers currently available for ${gpuTypeFromId}. The marketplace changes frequently - try again in a few minutes or choose a different GPU.`)
      }
      
      matchingOffers.push(...flexibleMatches)
    }

    // Sort by price and pick the cheapest available offer
    matchingOffers.sort((a, b) => (a.dph_total || 0) - (b.dph_total || 0))
    const bestOffer = matchingOffers[0]
    
    console.log(`Vast.ai: Found ${matchingOffers.length} offers for ${gpuTypeFromId}, using offer ${bestOffer.id} at $${bestOffer.dph_total?.toFixed(4)}/hr`)

    // Create instance via Vast.ai API
    const createPayload = {
      client_id: 'me',
      image: image,
      disk: volumeGb,
      label: name,
      onstart: null,
      env: env
    }

    const result = await vastaiRequest(
      `/asks/${bestOffer.id}/`,
      'PUT',
      createPayload
    )

    if (!result.success && !result.new_contract) {
      throw new Error(result.msg || 'Failed to create Vast.ai instance')
    }

    const instanceId = result.new_contract
    const pricePerHour = (bestOffer.dph_total || 0) * PRIMIS_DISCOUNT

    return {
      id: instanceId.toString(),
      provider: PROVIDERS.VASTAI,
      name: name,
      status: 'pending',
      gpuType: bestOffer.gpu_name,
      gpuCount: bestOffer.num_gpus || 1,
      pricePerHour: pricePerHour,
      createdAt: new Date(),
      metadata: {
        vastaiContractId: instanceId,
        vastaiOfferId: bestOffer.id,
        image,
        hostId: bestOffer.machine_id,
        region: bestOffer.geolocation
      }
    }
  },

  /**
   * Get instance details
   * @param {string} instanceId - Vast.ai contract ID
   * @returns {Promise<Instance>}
   */
  async getInstance(instanceId) {
    if (!getApiKey()) {
      throw new Error('Vast.ai API key not configured')
    }

    const data = await vastaiRequest(`/instances/${instanceId}/`)
    const instance = data.instances?.[0]

    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`)
    }

    return {
      id: instance.id.toString(),
      provider: PROVIDERS.VASTAI,
      name: instance.label || `vast-${instance.id}`,
      status: mapStatus(instance.actual_status),
      gpuType: instance.gpu_name,
      gpuCount: instance.num_gpus || 1,
      pricePerHour: (instance.dph_total || 0) * PRIMIS_DISCOUNT,
      sshHost: instance.ssh_host,
      sshPort: instance.ssh_port,
      jupyterUrl: instance.jupyter_url,
      uptimeSeconds: instance.duration || 0,
      createdAt: new Date(instance.start_date * 1000),
      metrics: {
        gpuUtilization: instance.gpu_util,
        diskUsage: instance.disk_usage
      },
      metadata: {
        vastaiContractId: instance.id,
        image: instance.image_uuid,
        localIp: instance.local_ipaddrs,
        cudaVersion: instance.cuda_max_good
      }
    }
  },

  /**
   * List all user's instances
   * @returns {Promise<Instance[]>}
   */
  async listInstances() {
    if (!getApiKey()) {
      return []
    }

    try {
      const data = await vastaiRequest('/instances/')
      const instances = data.instances || []

      return instances.map(instance => ({
        id: instance.id.toString(),
        provider: PROVIDERS.VASTAI,
        name: instance.label || `vast-${instance.id}`,
        status: mapStatus(instance.actual_status),
        gpuType: instance.gpu_name,
        gpuCount: instance.num_gpus || 1,
        pricePerHour: (instance.dph_total || 0) * PRIMIS_DISCOUNT,
        sshHost: instance.ssh_host,
        sshPort: instance.ssh_port,
        uptimeSeconds: instance.duration || 0,
        createdAt: new Date(instance.start_date * 1000),
        metadata: {
          vastaiContractId: instance.id
        }
      }))
    } catch (error) {
      console.error('Failed to list Vast.ai instances:', error.message)
      return []
    }
  },

  /**
   * Stop an instance (Vast.ai doesn't support pause, so this terminates)
   * Note: Vast.ai marketplace model means stopping = losing the instance
   */
  async stopInstance(instanceId) {
    console.warn('Vast.ai does not support stopping instances. Use terminate instead.')
    // Could implement as terminate, but better to be explicit
    throw new Error('Vast.ai does not support stopping instances. Data will be lost. Use terminate if you want to destroy.')
  },

  /**
   * Start a stopped instance (not supported on Vast.ai)
   */
  async startInstance(instanceId) {
    throw new Error('Vast.ai does not support resuming instances. Launch a new instance instead.')
  },

  /**
   * Terminate (destroy) an instance
   * @param {string} instanceId
   */
  async terminateInstance(instanceId) {
    if (!getApiKey()) {
      throw new Error('Vast.ai API key not configured')
    }

    await vastaiRequest(`/instances/${instanceId}/`, 'DELETE')
  }
}

export { VASTAI_BASE_URL, GPU_VRAM_MAP }
export default VastAiProvider
