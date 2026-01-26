/**
 * Lambda Labs Instance Provider Adapter
 * 
 * Implements IInstanceProvider interface for Lambda Labs GPU cloud.
 * Lambda Labs offers premium, enterprise-grade GPU instances with high reliability.
 * 
 * API Reference: https://cloud.lambdalabs.com/api/v1/
 * Known for: H100 availability, enterprise SLAs, fast provisioning
 * 
 * Positioning: Premium tier for enterprise workloads
 */

import { 
  PROVIDERS, 
  CAPABILITIES, 
  createGPUOfferingId, 
  calculateSavings,
  normalizeGPUName 
} from './types.js'

// Lazy getter for API key (checked at runtime, not module load time)
const getApiKey = () => process.env.LAMBDA_API_KEY
const LAMBDA_BASE_URL = 'https://cloud.lambdalabs.com/api/v1'

// Primis discount rate (15% below Lambda's enterprise pricing)
const PRIMIS_DISCOUNT = 0.85

// Lambda Labs instance types with known specs
// These will be overridden by live API data when available
const LAMBDA_INSTANCE_TYPES = {
  'gpu_1x_a10': {
    name: '1x A10',
    gpuType: 'A10',
    gpuCount: 1,
    vramGb: 24,
    vcpus: 30,
    ramGb: 200,
    marketPrice: 0.60,  // Lambda's public price
    storage: 1400
  },
  'gpu_1x_a100': {
    name: '1x A100 (40GB)',
    gpuType: 'A100 40GB',
    gpuCount: 1,
    vramGb: 40,
    vcpus: 30,
    ramGb: 200,
    marketPrice: 1.10,
    storage: 512
  },
  'gpu_1x_a100_sxm4': {
    name: '1x A100 SXM4 (80GB)',
    gpuType: 'A100 SXM4 80GB',
    gpuCount: 1,
    vramGb: 80,
    vcpus: 30,
    ramGb: 200,
    marketPrice: 1.29,
    storage: 512
  },
  'gpu_8x_a100_80gb_sxm4': {
    name: '8x A100 SXM4 (80GB)',
    gpuType: 'A100 SXM4 80GB',
    gpuCount: 8,
    vramGb: 640,
    vcpus: 124,
    ramGb: 1800,
    marketPrice: 10.32,
    storage: 6144
  },
  'gpu_1x_h100_pcie': {
    name: '1x H100 PCIe',
    gpuType: 'H100 PCIe',
    gpuCount: 1,
    vramGb: 80,
    vcpus: 26,
    ramGb: 200,
    marketPrice: 1.99,
    storage: 512
  },
  'gpu_1x_h100_sxm5': {
    name: '1x H100 SXM5',
    gpuType: 'H100 SXM5',
    gpuCount: 1,
    vramGb: 80,
    vcpus: 26,
    ramGb: 200,
    marketPrice: 2.49,
    storage: 512
  },
  'gpu_8x_h100_sxm5': {
    name: '8x H100 SXM5',
    gpuType: 'H100 SXM5',
    gpuCount: 8,
    vramGb: 640,
    vcpus: 208,
    ramGb: 1800,
    marketPrice: 19.92,
    storage: 20480
  },
  'gpu_1x_rtx6000': {
    name: '1x RTX 6000 Ada',
    gpuType: 'RTX 6000 Ada',
    gpuCount: 1,
    vramGb: 48,
    vcpus: 14,
    ramGb: 100,
    marketPrice: 0.80,
    storage: 512
  },
  'gpu_1x_h200': {
    name: '1x H200',
    gpuType: 'H200',
    gpuCount: 1,
    vramGb: 141,
    vcpus: 26,
    ramGb: 200,
    marketPrice: 3.49,
    storage: 512
  },
  'gpu_8x_h200': {
    name: '8x H200',
    gpuType: 'H200',
    gpuCount: 8,
    vramGb: 1128,
    vcpus: 208,
    ramGb: 1800,
    marketPrice: 27.92,
    storage: 20480
  }
}

/**
 * Make API request to Lambda Labs
 */
async function lambdaRequest(endpoint, method = 'GET', body = null) {
  if (!getApiKey()) {
    throw new Error('Lambda Labs API key not configured')
  }

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json'
    }
  }

  if (body) {
    options.body = JSON.stringify(body)
  }

  const response = await fetch(`${LAMBDA_BASE_URL}${endpoint}`, options)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
    throw new Error(`Lambda Labs API error: ${response.status} - ${error.error?.message || 'Unknown error'}`)
  }

  return response.json()
}

/**
 * Map Lambda Labs status to unified status
 */
function mapStatus(lambdaStatus) {
  const statusMap = {
    'active': 'running',
    'booting': 'pending',
    'unhealthy': 'degraded',
    'terminated': 'terminated'
  }
  return statusMap[lambdaStatus] || 'pending'
}

/**
 * Get Primis pricing for an instance type
 */
function getPricing(instanceType) {
  const config = LAMBDA_INSTANCE_TYPES[instanceType]
  if (config) {
    return {
      primisRate: config.marketPrice * PRIMIS_DISCOUNT,
      marketRate: config.marketPrice
    }
  }
  return { primisRate: 0, marketRate: 0 }
}

// =============================================================================
// PROVIDER IMPLEMENTATION
// =============================================================================

export const LambdaProvider = {
  name: PROVIDERS.LAMBDA,
  type: 'instance',
  tier: 'premium',  // Lambda is our premium tier

  capabilities: [
    CAPABILITIES.GPU_INSTANCES,
    CAPABILITIES.SSH_ACCESS,
    CAPABILITIES.JUPYTER_NOTEBOOKS,
    CAPABILITIES.PERSISTENT_STORAGE
  ],

  /**
   * Check if provider is configured
   */
  isConfigured() {
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
          provider: PROVIDERS.LAMBDA,
          status: 'unavailable',
          latencyMs: 0,
          checkedAt: new Date(),
          message: 'API key not configured'
        }
      }

      // Test with instance-types endpoint
      const response = await fetch(`${LAMBDA_BASE_URL}/instance-types`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${getApiKey()}`
        }
      })

      const latencyMs = Date.now() - startTime

      return {
        provider: PROVIDERS.LAMBDA,
        status: response.ok ? 'healthy' : 'degraded',
        latencyMs,
        checkedAt: new Date(),
        message: response.ok ? 'Connected' : `HTTP ${response.status}`
      }
    } catch (error) {
      return {
        provider: PROVIDERS.LAMBDA,
        status: 'unavailable',
        latencyMs: Date.now() - startTime,
        checkedAt: new Date(),
        message: error.message
      }
    }
  },

  /**
   * Get static GPU catalog (used when API key not configured)
   */
  getStaticGPUCatalog() {
    return Object.entries(LAMBDA_INSTANCE_TYPES).map(([typeId, config]) => {
      const pricing = getPricing(typeId)
      return {
        id: createGPUOfferingId(PROVIDERS.LAMBDA, config.gpuType),
        provider: PROVIDERS.LAMBDA,
        gpuType: config.gpuType,
        vramGb: config.vramGb,
        gpuCount: config.gpuCount,
        pricePerHour: pricing.primisRate,
        marketPrice: pricing.marketRate,
        available: false,  // Static = not confirmed available
        reliability: 0.98,  // Lambda has high reliability
        savings: calculateSavings(pricing.primisRate, pricing.marketRate),
        tier: 'premium',
        metadata: {
          lambdaInstanceType: typeId,
          vcpus: config.vcpus,
          ramGb: config.ramGb,
          storage: config.storage,
          name: config.name
        }
      }
    })
  },

  /**
   * List available GPU offerings
   * @returns {Promise<GPUOffering[]>}
   */
  async getGPUOfferings() {
    // Return static catalog when not configured (with available: false)
    if (!getApiKey()) {
      return this.getStaticGPUCatalog()
    }

    try {
      const data = await lambdaRequest('/instance-types')
      
      // Lambda returns { data: { instance-type-id: { ... }, ... } }
      const instanceTypes = data.data || {}
      
      return Object.entries(instanceTypes).map(([typeId, instance]) => {
        // Get static config for specs, merge with live availability
        const staticConfig = LAMBDA_INSTANCE_TYPES[typeId] || {}
        const specs = instance.instance_type?.specs || {}
        
        const gpuCount = specs.gpus || staticConfig.gpuCount || 1
        const vramGb = (specs.memory_gib || staticConfig.vramGb || 24) 
        const gpuType = instance.instance_type?.description || staticConfig.gpuType || typeId
        
        // Use live price if available, otherwise static
        const marketPrice = instance.instance_type?.price_cents_per_hour 
          ? instance.instance_type.price_cents_per_hour / 100 
          : staticConfig.marketPrice || 1.0
        
        const primisRate = marketPrice * PRIMIS_DISCOUNT

        // Check if any regions have availability
        const regions = instance.regions_with_capacity_available || []
        const isAvailable = regions.length > 0

        return {
          id: createGPUOfferingId(PROVIDERS.LAMBDA, gpuType),
          provider: PROVIDERS.LAMBDA,
          gpuType,
          vramGb,
          gpuCount,
          pricePerHour: primisRate,
          marketPrice,
          available: isAvailable,
          reliability: 0.98,  // Lambda has enterprise-grade reliability
          savings: calculateSavings(primisRate, marketPrice),
          tier: 'premium',
          metadata: {
            lambdaInstanceType: typeId,
            vcpus: specs.vcpus || staticConfig.vcpus,
            ramGb: specs.memory_gib || staticConfig.ramGb,
            storage: specs.storage_gib || staticConfig.storage,
            availableRegions: regions,
            name: instance.instance_type?.description || staticConfig.name
          }
        }
      }).sort((a, b) => a.pricePerHour - b.pricePerHour)
    } catch (error) {
      console.error('Lambda Labs getGPUOfferings error:', error.message)
      // Fall back to static catalog on error
      return this.getStaticGPUCatalog()
    }
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
      region,
      sshKeyNames = [],
      fileSystemNames = []
    } = config

    // Get instance type from offering ID
    const offerings = await this.getGPUOfferings()
    const offering = offerings.find(o => o.id === gpuOfferingId)
    
    if (!offering) {
      throw new Error(`GPU offering not found: ${gpuOfferingId}`)
    }

    const instanceType = offering.metadata?.lambdaInstanceType
    if (!instanceType) {
      throw new Error(`Instance type not found for offering: ${gpuOfferingId}`)
    }

    // Determine region (use first available if not specified)
    const targetRegion = region || offering.metadata?.availableRegions?.[0]
    if (!targetRegion) {
      throw new Error(`No region available for ${offering.gpuType}`)
    }

    const data = await lambdaRequest('/instance-operations/launch', 'POST', {
      region_name: targetRegion,
      instance_type_name: instanceType,
      ssh_key_names: sshKeyNames,
      file_system_names: fileSystemNames,
      quantity: 1,
      name: name || `primis-${Date.now()}`
    })

    // Lambda returns { data: { instance_ids: [...] } }
    const instanceId = data.data?.instance_ids?.[0]
    
    if (!instanceId) {
      throw new Error('Failed to get instance ID from launch response')
    }

    return {
      id: instanceId,
      provider: PROVIDERS.LAMBDA,
      name: name || `primis-${instanceId.slice(0, 8)}`,
      gpuType: offering.gpuType,
      gpuCount: offering.gpuCount,
      pricePerHour: offering.pricePerHour,
      status: 'pending',
      region: targetRegion,
      createdAt: new Date(),
      metadata: {
        lambdaInstanceType: instanceType,
        tier: 'premium'
      }
    }
  },

  /**
   * Get instance details
   * @param {string} instanceId
   * @returns {Promise<Instance>}
   */
  async getInstance(instanceId) {
    const data = await lambdaRequest(`/instances/${instanceId}`)
    const instance = data.data
    
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`)
    }

    const staticConfig = LAMBDA_INSTANCE_TYPES[instance.instance_type?.name] || {}
    const pricing = getPricing(instance.instance_type?.name)

    return {
      id: instance.id,
      provider: PROVIDERS.LAMBDA,
      name: instance.name || `lambda-${instance.id.slice(0, 8)}`,
      gpuType: instance.instance_type?.description || staticConfig.gpuType || 'Unknown',
      gpuCount: staticConfig.gpuCount || 1,
      pricePerHour: pricing.primisRate,
      status: mapStatus(instance.status),
      region: instance.region?.name,
      createdAt: new Date(instance.created_at || Date.now()),
      metadata: {
        ip: instance.ip,
        hostname: instance.hostname,
        jupyterUrl: instance.jupyter_url,
        jupyterToken: instance.jupyter_token,
        lambdaInstanceType: instance.instance_type?.name,
        tier: 'premium'
      }
    }
  },

  /**
   * List all instances
   * @returns {Promise<Instance[]>}
   */
  async listInstances() {
    const data = await lambdaRequest('/instances')
    const instances = data.data || []

    return instances.map(instance => {
      const staticConfig = LAMBDA_INSTANCE_TYPES[instance.instance_type?.name] || {}
      const pricing = getPricing(instance.instance_type?.name)

      return {
        id: instance.id,
        provider: PROVIDERS.LAMBDA,
        name: instance.name || `lambda-${instance.id.slice(0, 8)}`,
        gpuType: instance.instance_type?.description || staticConfig.gpuType || 'Unknown',
        gpuCount: staticConfig.gpuCount || 1,
        pricePerHour: pricing.primisRate,
        status: mapStatus(instance.status),
        region: instance.region?.name,
        createdAt: new Date(instance.created_at || Date.now()),
        metadata: {
          ip: instance.ip,
          hostname: instance.hostname,
          jupyterUrl: instance.jupyter_url,
          tier: 'premium'
        }
      }
    })
  },

  /**
   * Terminate an instance
   * @param {string} instanceId
   * @returns {Promise<void>}
   */
  async terminateInstance(instanceId) {
    await lambdaRequest('/instance-operations/terminate', 'POST', {
      instance_ids: [instanceId]
    })
  },

  /**
   * Lambda Labs doesn't support stop/resume - instances run until terminated
   * These methods throw errors to indicate unsupported operations
   */
  async stopInstance(instanceId) {
    throw new Error('Lambda Labs does not support stopping instances. Use terminate instead.')
  },

  async resumeInstance(instanceId) {
    throw new Error('Lambda Labs does not support resuming instances. Launch a new instance instead.')
  }
}

export default LambdaProvider
