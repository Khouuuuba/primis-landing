/**
 * Test Moltbot Deployment to RunPod
 * 
 * This script tests deploying a Moltbot container to RunPod.
 * Used for M1.1 validation of the Moltbot integration.
 * 
 * Usage:
 *   RUNPOD_API_KEY=xxx node scripts/test-moltbot-deploy.js
 * 
 * Options:
 *   --dry-run    Show what would be deployed without actually deploying
 *   --terminate  Terminate existing test pods before deploying
 */

import 'dotenv/config'

const RUNPOD_API_URL = 'https://api.runpod.io/graphql'
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY

// Moltbot image config
const MOLTBOT_IMAGE = 'ghcr.io/primisprotocol/moltbot:latest'
const MOLTBOT_POD_NAME = 'primis-moltbot-test'

// Test environment variables (use placeholder values)
const TEST_ENV = {
  NODE_ENV: 'production',
  CLAWDBOT_STATE_DIR: '/data',
  NODE_OPTIONS: '--max-old-space-size=1536',
  // These would be user-provided in production:
  // ANTHROPIC_API_KEY: 'sk-ant-xxx',
  // TELEGRAM_BOT_TOKEN: '123:abc',
}

// Resource requirements
const RESOURCES = {
  containerDiskInGb: 15,  // Container disk
  volumeInGb: 5,          // Persistent volume for /data
  volumeMountPath: '/data',
}

/**
 * Execute GraphQL query against RunPod API
 */
async function runpodQuery(query, variables = {}) {
  if (!RUNPOD_API_KEY) {
    throw new Error('RUNPOD_API_KEY environment variable is required')
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
    console.error('RunPod API Error:', JSON.stringify(data.errors, null, 2))
    throw new Error(data.errors[0]?.message || 'RunPod API error')
  }
  
  return data.data
}

/**
 * List existing pods to find any test pods
 */
async function listPods() {
  const query = `
    query Pods {
      myself {
        pods {
          id
          name
          desiredStatus
          imageName
          runtime {
            uptimeInSeconds
            ports { ip publicPort privatePort }
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
 * Terminate a pod by ID
 */
async function terminatePod(podId) {
  const query = `
    mutation TerminatePod($podId: String!) {
      podTerminate(input: { podId: $podId })
    }
  `
  await runpodQuery(query, { podId })
  console.log(`✓ Terminated pod: ${podId}`)
}

/**
 * Deploy Moltbot container
 * 
 * Note: This attempts CPU-only deployment first.
 * If RunPod requires GPU, will fall back to cheapest GPU.
 */
async function deployMoltbot(dryRun = false) {
  console.log('\n🤖 Deploying Moltbot to RunPod...\n')
  
  const config = {
    name: MOLTBOT_POD_NAME,
    imageName: MOLTBOT_IMAGE,
    gpuCount: 0,  // CPU-only (may not be supported)
    containerDiskInGb: RESOURCES.containerDiskInGb,
    volumeInGb: RESOURCES.volumeInGb,
    volumeMountPath: RESOURCES.volumeMountPath,
    env: Object.entries(TEST_ENV).map(([key, value]) => ({ key, value })),
    cloudType: 'SECURE',
    supportPublicIp: true,
    ports: '18789/http,22/tcp',  // Gateway + SSH
  }
  
  console.log('Configuration:')
  console.log(JSON.stringify(config, null, 2))
  
  if (dryRun) {
    console.log('\n--dry-run flag set. Skipping actual deployment.')
    return null
  }
  
  // Try CPU-only first
  try {
    const query = `
      mutation CreatePod($input: PodFindAndDeployOnDemandInput!) {
        podFindAndDeployOnDemand(input: $input) {
          id
          name
          imageName
          desiredStatus
          runtime {
            ports { ip publicPort privatePort }
          }
        }
      }
    `
    
    const data = await runpodQuery(query, { input: config })
    const pod = data.podFindAndDeployOnDemand
    
    console.log('\n✓ Moltbot deployed successfully!')
    console.log(`  Pod ID: ${pod.id}`)
    console.log(`  Name: ${pod.name}`)
    console.log(`  Status: ${pod.desiredStatus}`)
    
    if (pod.runtime?.ports) {
      console.log('\n  Ports:')
      for (const port of pod.runtime.ports) {
        console.log(`    ${port.privatePort} -> ${port.ip}:${port.publicPort}`)
      }
    }
    
    return pod
    
  } catch (error) {
    if (error.message.includes('GPU') || error.message.includes('gpuCount')) {
      console.log('\n⚠️  CPU-only deployment not supported. Trying with cheapest GPU...\n')
      
      // Fallback to cheapest GPU (RTX 3070)
      config.gpuCount = 1
      config.gpuTypeId = 'NVIDIA GeForce RTX 3070'
      
      const query = `
        mutation CreatePod($input: PodFindAndDeployOnDemandInput!) {
          podFindAndDeployOnDemand(input: $input) {
            id
            name
            imageName
            desiredStatus
            machine { gpuDisplayName }
            runtime {
              ports { ip publicPort privatePort }
            }
          }
        }
      `
      
      const data = await runpodQuery(query, { input: config })
      const pod = data.podFindAndDeployOnDemand
      
      console.log('\n✓ Moltbot deployed with GPU fallback!')
      console.log(`  Pod ID: ${pod.id}`)
      console.log(`  GPU: ${pod.machine?.gpuDisplayName}`)
      
      return pod
    }
    
    throw error
  }
}

/**
 * Get pod status and resource usage
 */
async function getPodStatus(podId) {
  const query = `
    query Pod($podId: String!) {
      pod(input: { podId: $podId }) {
        id
        name
        desiredStatus
        lastStatusChange
        runtime {
          uptimeInSeconds
          ports { ip publicPort privatePort isIpPublic }
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
 * Monitor pod until running or timeout
 */
async function waitForPodReady(podId, timeoutMs = 120000) {
  console.log('\n⏳ Waiting for pod to be ready...')
  
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeoutMs) {
    const pod = await getPodStatus(podId)
    
    console.log(`  Status: ${pod.desiredStatus}, Uptime: ${pod.runtime?.uptimeInSeconds || 0}s`)
    
    if (pod.desiredStatus === 'RUNNING' && pod.runtime?.ports?.length > 0) {
      console.log('\n✓ Pod is ready!')
      return pod
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  
  throw new Error('Timeout waiting for pod to be ready')
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const shouldTerminate = args.includes('--terminate')
  
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Moltbot on RunPod - Deployment Test')
  console.log('  Sprint: M1.1 - Docker Validation')
  console.log('═══════════════════════════════════════════════════════════')
  
  // Check for existing test pods
  console.log('\n📋 Checking for existing test pods...')
  const existingPods = await listPods()
  const testPods = existingPods.filter(p => p.name === MOLTBOT_POD_NAME)
  
  if (testPods.length > 0) {
    console.log(`\n  Found ${testPods.length} existing test pod(s):`)
    for (const pod of testPods) {
      console.log(`    - ${pod.id}: ${pod.desiredStatus}`)
      
      if (shouldTerminate) {
        await terminatePod(pod.id)
      }
    }
    
    if (!shouldTerminate) {
      console.log('\n  Use --terminate flag to remove existing pods before deploying.')
      return
    }
  }
  
  // Deploy Moltbot
  const pod = await deployMoltbot(dryRun)
  
  if (!pod || dryRun) {
    console.log('\n✓ Dry run complete.')
    return
  }
  
  // Wait for ready
  try {
    const readyPod = await waitForPodReady(pod.id)
    
    // Print connection info
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('  CONNECTION INFO')
    console.log('═══════════════════════════════════════════════════════════')
    
    const gatewayPort = readyPod.runtime?.ports?.find(p => p.privatePort === 18789)
    const sshPort = readyPod.runtime?.ports?.find(p => p.privatePort === 22)
    
    if (gatewayPort) {
      console.log(`\n  Gateway URL: http://${gatewayPort.ip}:${gatewayPort.publicPort}`)
    }
    
    if (sshPort) {
      console.log(`  SSH: ssh -p ${sshPort.publicPort} root@${sshPort.ip}`)
    }
    
    console.log('\n  Resource Usage:')
    if (readyPod.runtime?.gpus?.[0]) {
      console.log(`    GPU Util: ${readyPod.runtime.gpus[0].gpuUtilPercent}%`)
      console.log(`    GPU Memory: ${readyPod.runtime.gpus[0].memoryUtilPercent}%`)
    }
    console.log(`    Uptime: ${readyPod.runtime?.uptimeInSeconds || 0}s`)
    
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('  Next Steps:')
    console.log('  1. SSH into pod to check logs')
    console.log('  2. Test Telegram/Discord connectivity')
    console.log('  3. Measure RAM/CPU usage with `docker stats`')
    console.log('  4. Run --terminate when done')
    console.log('═══════════════════════════════════════════════════════════')
    
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.log(`\n  To terminate failed pod: node scripts/test-moltbot-deploy.js --terminate`)
  }
}

main().catch(console.error)
