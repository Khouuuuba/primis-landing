import dotenv from 'dotenv'

dotenv.config()

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY
const RUNPOD_API_URL = 'https://api.runpod.io/graphql'

if (!RUNPOD_API_KEY) {
  console.warn('⚠️  RUNPOD_API_KEY not set. GPU provisioning disabled.')
}

// GPU type mappings (RunPod ID → Our ID)
export const GPU_MAPPINGS = {
  'NVIDIA GeForce RTX 4090': { id: 'gpu-rtx4090', primisRate: 0.69, marketRate: 0.89 },
  'NVIDIA RTX A4000': { id: 'gpu-a4000', primisRate: 0.29, marketRate: 0.39 },
  'NVIDIA RTX A5000': { id: 'gpu-a5000', primisRate: 0.39, marketRate: 0.49 },
  'NVIDIA RTX A6000': { id: 'gpu-a6000', primisRate: 0.69, marketRate: 0.89 },
  'NVIDIA A40': { id: 'gpu-a40', primisRate: 0.69, marketRate: 0.89 },
  'NVIDIA L40': { id: 'gpu-l40', primisRate: 0.89, marketRate: 1.09 },
  'NVIDIA A100 80GB PCIe': { id: 'gpu-a100-80', primisRate: 1.89, marketRate: 2.49 },
  'NVIDIA A100-SXM4-80GB': { id: 'gpu-a100-sxm', primisRate: 1.99, marketRate: 2.69 },
  'NVIDIA H100 PCIe': { id: 'gpu-h100-pcie', primisRate: 2.99, marketRate: 3.89 },
  'NVIDIA H100 80GB HBM3': { id: 'gpu-h100-80', primisRate: 3.49, marketRate: 4.49 }
}

/**
 * Execute GraphQL query against RunPod API
 */
async function runpodQuery(query, variables = {}) {
  if (!RUNPOD_API_KEY) {
    throw new Error('RunPod API key not configured')
  }

  const response = await fetch(RUNPOD_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RUNPOD_API_KEY}`
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
 * Verify RunPod connection
 */
export async function verifyRunPodConnection() {
  if (!RUNPOD_API_KEY) return false
  
  try {
    const data = await runpodQuery(`query { myself { id email } }`)
    console.log('✅ RunPod connected:', data.myself?.email)
    return true
  } catch (error) {
    console.error('❌ RunPod connection failed:', error.message)
    return false
  }
}

/**
 * Get available GPU types with real-time pricing and availability
 */
export async function getGpuTypes() {
  const query = `
    query GpuTypes {
      gpuTypes {
        id
        displayName
        memoryInGb
        secureCloud
        communityCloud
        lowestPrice {
          minimumBidPrice
          uninterruptablePrice
        }
      }
    }
  `
  
  try {
    const data = await runpodQuery(query)
    return data.gpuTypes.map(gpu => {
      const mapping = GPU_MAPPINGS[gpu.displayName] || {}
      return {
        runpodId: gpu.id,
        name: gpu.displayName,
        vram: gpu.memoryInGb,
        available: gpu.secureCloud || gpu.communityCloud,
        runpodPrice: gpu.lowestPrice?.uninterruptablePrice || gpu.lowestPrice?.minimumBidPrice,
        primisRate: mapping.primisRate || (gpu.lowestPrice?.uninterruptablePrice * 0.8),
        marketRate: mapping.marketRate || gpu.lowestPrice?.uninterruptablePrice,
        primisId: mapping.id || `gpu-${gpu.id}`
      }
    }).filter(gpu => gpu.available)
  } catch (error) {
    console.error('Failed to fetch GPU types:', error.message)
    return []
  }
}

/**
 * Create a new pod (GPU instance)
 */
export async function createPod({
  name,
  gpuTypeId,
  gpuCount = 1,
  imageName = 'runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04',
  volumeInGb = 20,
  containerDiskInGb = 20,
  env = {}
}) {
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
          gpus {
            id
            gpuUtilPercent
            memoryUtilPercent
          }
        }
      }
    }
  `
  
  const variables = {
    input: {
      name,
      gpuTypeId,
      gpuCount,
      imageName,
      volumeInGb,
      containerDiskInGb,
      cloudType: 'SECURE', // or 'COMMUNITY' for cheaper
      supportPublicIp: true,
      startSsh: true,
      env: Object.entries(env).map(([key, value]) => ({ key, value }))
    }
  }
  
  const data = await runpodQuery(query, variables)
  return data.podFindAndDeployOnDemand
}

/**
 * Get pod status
 */
export async function getPod(podId) {
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
  
  const data = await runpodQuery(query, { podId })
  return data.pod
}

/**
 * Get all user's pods
 */
export async function getMyPods() {
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
          }
          machine {
            gpuDisplayName
          }
        }
      }
    }
  `
  
  const data = await runpodQuery(query)
  return data.myself?.pods || []
}

/**
 * Stop a pod (pause billing but keep volume)
 */
export async function stopPod(podId) {
  const query = `
    mutation StopPod($podId: String!) {
      podStop(input: { podId: $podId }) {
        id
        desiredStatus
      }
    }
  `
  
  const data = await runpodQuery(query, { podId })
  return data.podStop
}

/**
 * Terminate a pod (delete completely)
 */
export async function terminatePod(podId) {
  const query = `
    mutation TerminatePod($podId: String!) {
      podTerminate(input: { podId: $podId })
    }
  `
  
  const data = await runpodQuery(query, { podId })
  return data.podTerminate
}

/**
 * Resume a stopped pod
 */
export async function resumePod(podId, gpuCount = 1) {
  const query = `
    mutation ResumePod($podId: String!, $gpuCount: Int!) {
      podResume(input: { podId: $podId, gpuCount: $gpuCount }) {
        id
        desiredStatus
      }
    }
  `
  
  const data = await runpodQuery(query, { podId, gpuCount })
  return data.podResume
}

export default {
  verifyRunPodConnection,
  getGpuTypes,
  createPod,
  getPod,
  getMyPods,
  stopPod,
  terminatePod,
  resumePod
}
