/**
 * RunPod Instance Provider Adapter
 * 
 * Implements IInstanceProvider interface for RunPod GPU instances.
 * Wraps the existing runpod.js module with unified interface.
 */

import { 
  PROVIDERS, 
  CAPABILITIES, 
  createGPUOfferingId, 
  calculateSavings,
  normalizeGPUName 
} from './types.js'

// Lazy getter for API key (checked at runtime, not module load time)
const getApiKey = () => process.env.RUNPOD_API_KEY
const RUNPOD_API_URL = 'https://api.runpod.io/graphql'

// Primis discount rate (25% below market)
const PRIMIS_DISCOUNT = 0.75

// GPU pricing overrides (Primis rates) - comprehensive list matching RunPod API names
// Note: RunPod's lowestPrice API is currently broken, so we use static pricing
// Keys MUST match exact GPU names from RunPod API (case-sensitive)
const GPU_PRICING = {
  // Consumer GPUs (exact RunPod API names)
  'RTX 3070': { primisRate: 0.14, marketRate: 0.19 },
  'RTX 3080': { primisRate: 0.18, marketRate: 0.24 },
  'RTX 3080 Ti': { primisRate: 0.19, marketRate: 0.25 },
  'RTX 3090': { primisRate: 0.24, marketRate: 0.32 },
  'RTX 3090 Ti': { primisRate: 0.26, marketRate: 0.34 },
  'RTX 4070 Ti': { primisRate: 0.26, marketRate: 0.34 },
  'RTX 4080': { primisRate: 0.28, marketRate: 0.37 },
  'RTX 4080 SUPER': { primisRate: 0.30, marketRate: 0.39 },
  'RTX 4090': { primisRate: 0.33, marketRate: 0.44 },
  'RTX 5080': { primisRate: 0.35, marketRate: 0.46 },
  'RTX 5090': { primisRate: 0.52, marketRate: 0.69 },
  
  // Professional GPUs (exact RunPod API names)
  'RTX A2000': { primisRate: 0.15, marketRate: 0.19 },
  'RTX A4000': { primisRate: 0.22, marketRate: 0.29 },
  'RTX A4500': { primisRate: 0.26, marketRate: 0.34 },
  'RTX A5000': { primisRate: 0.30, marketRate: 0.39 },
  'RTX A6000': { primisRate: 0.52, marketRate: 0.69 },
  'RTX 2000 Ada': { primisRate: 0.18, marketRate: 0.24 },
  'RTX 4000 Ada': { primisRate: 0.26, marketRate: 0.34 },
  'RTX 4000 Ada SFF': { primisRate: 0.26, marketRate: 0.34 },
  'RTX 5000 Ada': { primisRate: 0.37, marketRate: 0.49 },
  'RTX 6000 Ada': { primisRate: 0.67, marketRate: 0.89 },
  'RTX PRO 6000': { primisRate: 1.12, marketRate: 1.49 },
  'RTX PRO 6000 MaxQ': { primisRate: 1.12, marketRate: 1.49 },
  'RTX PRO 6000 WK': { primisRate: 1.12, marketRate: 1.49 },
  
  // Data Center GPUs (exact RunPod API names)
  'A30': { primisRate: 0.45, marketRate: 0.59 },
  'A40': { primisRate: 0.52, marketRate: 0.69 },
  'L4': { primisRate: 0.37, marketRate: 0.49 },
  'L40': { primisRate: 0.67, marketRate: 0.89 },
  'L40S': { primisRate: 0.74, marketRate: 0.99 },
  'A100 PCIe': { primisRate: 1.42, marketRate: 1.89 },
  'A100 SXM': { primisRate: 1.49, marketRate: 1.99 },
  'H100 PCIe': { primisRate: 2.24, marketRate: 2.99 },
  'H100 SXM': { primisRate: 2.62, marketRate: 3.49 },
  'H100 NVL': { primisRate: 2.99, marketRate: 3.99 },
  'H200 SXM': { primisRate: 3.37, marketRate: 4.49 },
  'NVIDIA H200 NVL': { primisRate: 3.74, marketRate: 4.99 },
  
  // Next-gen Data Center
  'B200': { primisRate: 4.49, marketRate: 5.99 },
  'B300': { primisRate: 5.99, marketRate: 7.99 },
  
  // AMD
  'MI300X': { primisRate: 2.99, marketRate: 3.99 },
  
  // V100 variants
  'Tesla V100': { primisRate: 0.37, marketRate: 0.49 },
  'V100 SXM2': { primisRate: 0.37, marketRate: 0.49 },
  'V100 SXM2 32GB': { primisRate: 0.45, marketRate: 0.59 }
}

/**
 * Execute GraphQL query against RunPod API
 */
async function runpodQuery(query, variables = {}) {
  if (!getApiKey()) {
    throw new Error('RunPod API key not configured')
  }

  const response = await fetch(RUNPOD_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`
    },
    body: JSON.stringify({ query, variables })
  })

  const data = await response.json()
  
  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'RunPod API error')
  }
  
  return data.data
}

/**
 * Map RunPod status to unified status
 */
function mapStatus(runpodStatus) {
  const statusMap = {
    'RUNNING': 'running',
    'EXITED': 'stopped',
    'CREATED': 'pending',
    'RESTARTING': 'pending',
    'PAUSED': 'stopped',
    'DEAD': 'terminated'
  }
  return statusMap[runpodStatus] || 'pending'
}

/**
 * Get pricing for a GPU type
 * First tries exact match, then normalized match
 */
function getGPUPricing(gpuName, runpodPrice) {
  // Try exact match first (RunPod API names are clean)
  let override = GPU_PRICING[gpuName]
  
  // If no exact match, try normalized name
  if (!override) {
    const normalized = normalizeGPUName(gpuName)
    override = GPU_PRICING[normalized]
  }
  
  if (override) {
    return {
      primisRate: override.primisRate,
      marketRate: override.marketRate
    }
  }
  
  // Default: apply 25% discount to RunPod price or estimate based on VRAM
  return {
    primisRate: runpodPrice ? runpodPrice * PRIMIS_DISCOUNT : 0.25,
    marketRate: runpodPrice || 0.33
  }
}

// =============================================================================
// INSTANCE PROVIDER IMPLEMENTATION
// =============================================================================

/**
 * RunPod Instance Provider
 * @implements {IInstanceProvider}
 */
const RunPodInstanceProvider = {
  name: PROVIDERS.RUNPOD,
  capability: CAPABILITIES.BOTH,

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

      const data = await runpodQuery(`query { myself { id } }`)
      const latencyMs = Date.now() - startTime

      return {
        provider: PROVIDERS.RUNPOD,
        status: data.myself ? 'healthy' : 'degraded',
        latencyMs,
        checkedAt: new Date(),
        message: 'Connected'
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
   * List available GPU offerings
   * @returns {Promise<GPUOffering[]>}
   */
  async getGPUOfferings() {
    // NOTE: lowestPrice field is currently broken on RunPod's API (returns INTERNAL_SERVER_ERROR)
    // So we query without it and use our static pricing map instead
    const query = `
      query GpuTypes {
        gpuTypes {
          id
          displayName
          memoryInGb
          secureCloud
          communityCloud
        }
      }
    `

    const data = await runpodQuery(query)
    
    return data.gpuTypes
      .filter(gpu => gpu.secureCloud || gpu.communityCloud)
      .map(gpu => {
        // Use static pricing since lowestPrice API is broken
        const pricing = getGPUPricing(gpu.displayName, null)
        
        return {
          id: createGPUOfferingId(PROVIDERS.RUNPOD, gpu.displayName),
          provider: PROVIDERS.RUNPOD,
          gpuType: gpu.displayName,
          vramGb: gpu.memoryInGb,
          gpuCount: 1,
          pricePerHour: pricing.primisRate,
          marketPrice: pricing.marketRate,
          available: gpu.secureCloud || gpu.communityCloud,
          reliability: gpu.secureCloud ? 0.95 : 0.85,
          savings: calculateSavings(pricing.primisRate, pricing.marketRate),
          metadata: {
            runpodId: gpu.id,
            secureCloud: gpu.secureCloud,
            communityCloud: gpu.communityCloud
          }
        }
      })
      .sort((a, b) => a.pricePerHour - b.pricePerHour)
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
      gpuCount = 1, 
      image = 'runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04',
      volumeGb = 20,
      diskGb = 20,
      env = {}
    } = config

    // Get GPU type from offering ID
    const offerings = await this.getGPUOfferings()
    const offering = offerings.find(o => o.id === gpuOfferingId)
    
    if (!offering) {
      throw new Error(`GPU offering not found: ${gpuOfferingId}`)
    }

    const query = `
      mutation CreatePod($input: PodFindAndDeployOnDemandInput!) {
        podFindAndDeployOnDemand(input: $input) {
          id
          name
          imageName
          gpuCount
          machineId
          machine {
            gpuDisplayName
          }
          runtime {
            uptimeInSeconds
            ports {
              ip
              isIpPublic
              privatePort
              publicPort
            }
          }
        }
      }
    `

    const variables = {
      input: {
        name,
        gpuTypeId: offering.metadata.runpodId,
        gpuCount,
        imageName: image,
        volumeInGb: volumeGb,
        containerDiskInGb: diskGb,
        cloudType: 'SECURE',
        supportPublicIp: true,
        startSsh: true,
        env: Object.entries(env).map(([key, value]) => ({ key, value }))
      }
    }

    const data = await runpodQuery(query, variables)
    const pod = data.podFindAndDeployOnDemand

    // Find SSH port
    const sshPort = pod.runtime?.ports?.find(p => p.privatePort === 22)

    return {
      id: pod.id,
      provider: PROVIDERS.RUNPOD,
      name: pod.name,
      status: 'pending',
      gpuType: pod.machine?.gpuDisplayName || offering.gpuType,
      gpuCount: pod.gpuCount,
      pricePerHour: offering.pricePerHour,
      sshHost: sshPort?.ip,
      sshPort: sshPort?.publicPort,
      uptimeSeconds: pod.runtime?.uptimeInSeconds || 0,
      createdAt: new Date(),
      metadata: {
        runpodId: pod.id,
        machineId: pod.machineId,
        imageName: pod.imageName
      }
    }
  },

  /**
   * Get instance details
   * @param {string} instanceId - RunPod pod ID
   * @returns {Promise<Instance>}
   */
  async getInstance(instanceId) {
    const query = `
      query Pod($podId: String!) {
        pod(input: { podId: $podId }) {
          id
          name
          imageName
          gpuCount
          desiredStatus
          lastStatusChange
          runtime {
            uptimeInSeconds
            ports {
              ip
              isIpPublic
              privatePort
              publicPort
            }
            gpus {
              id
              gpuUtilPercent
              memoryUtilPercent
            }
          }
          machine {
            gpuDisplayName
          }
        }
      }
    `

    const data = await runpodQuery(query, { podId: instanceId })
    const pod = data.pod

    if (!pod) {
      throw new Error(`Instance not found: ${instanceId}`)
    }

    const sshPort = pod.runtime?.ports?.find(p => p.privatePort === 22)
    const jupyterPort = pod.runtime?.ports?.find(p => p.privatePort === 8888)
    const pricing = getGPUPricing(pod.machine?.gpuDisplayName, null)

    return {
      id: pod.id,
      provider: PROVIDERS.RUNPOD,
      name: pod.name,
      status: mapStatus(pod.desiredStatus),
      gpuType: pod.machine?.gpuDisplayName,
      gpuCount: pod.gpuCount,
      pricePerHour: pricing.primisRate,
      sshHost: sshPort?.ip,
      sshPort: sshPort?.publicPort,
      jupyterUrl: jupyterPort ? `http://${jupyterPort.ip}:${jupyterPort.publicPort}` : null,
      uptimeSeconds: pod.runtime?.uptimeInSeconds || 0,
      createdAt: new Date(pod.lastStatusChange),
      metrics: pod.runtime?.gpus?.[0] ? {
        gpuUtilization: pod.runtime.gpus[0].gpuUtilPercent,
        memoryUtilization: pod.runtime.gpus[0].memoryUtilPercent
      } : null,
      metadata: {
        runpodId: pod.id,
        imageName: pod.imageName,
        desiredStatus: pod.desiredStatus
      }
    }
  },

  /**
   * List all user's instances
   * @returns {Promise<Instance[]>}
   */
  async listInstances() {
    const query = `
      query Pods {
        myself {
          pods {
            id
            name
            desiredStatus
            lastStatusChange
            imageName
            gpuCount
            runtime {
              uptimeInSeconds
              ports {
                ip
                isIpPublic
                privatePort
                publicPort
              }
            }
            machine {
              gpuDisplayName
            }
          }
        }
      }
    `

    const data = await runpodQuery(query)
    const pods = data.myself?.pods || []

    return pods.map(pod => {
      const sshPort = pod.runtime?.ports?.find(p => p.privatePort === 22)
      const pricing = getGPUPricing(pod.machine?.gpuDisplayName, null)

      return {
        id: pod.id,
        provider: PROVIDERS.RUNPOD,
        name: pod.name,
        status: mapStatus(pod.desiredStatus),
        gpuType: pod.machine?.gpuDisplayName,
        gpuCount: pod.gpuCount,
        pricePerHour: pricing.primisRate,
        sshHost: sshPort?.ip,
        sshPort: sshPort?.publicPort,
        uptimeSeconds: pod.runtime?.uptimeInSeconds || 0,
        createdAt: new Date(pod.lastStatusChange),
        metadata: {
          runpodId: pod.id,
          imageName: pod.imageName
        }
      }
    })
  },

  /**
   * Stop (pause) an instance
   * @param {string} instanceId
   */
  async stopInstance(instanceId) {
    const query = `
      mutation StopPod($podId: String!) {
        podStop(input: { podId: $podId }) {
          id
          desiredStatus
        }
      }
    `
    await runpodQuery(query, { podId: instanceId })
  },

  /**
   * Start (resume) a stopped instance
   * @param {string} instanceId
   */
  async startInstance(instanceId) {
    const query = `
      mutation ResumePod($podId: String!, $gpuCount: Int!) {
        podResume(input: { podId: $podId, gpuCount: $gpuCount }) {
          id
          desiredStatus
        }
      }
    `
    await runpodQuery(query, { podId: instanceId, gpuCount: 1 })
  },

  /**
   * Terminate (delete) an instance
   * @param {string} instanceId
   */
  async terminateInstance(instanceId) {
    const query = `
      mutation TerminatePod($podId: String!) {
        podTerminate(input: { podId: $podId })
      }
    `
    await runpodQuery(query, { podId: instanceId })
  }
}

export default RunPodInstanceProvider
