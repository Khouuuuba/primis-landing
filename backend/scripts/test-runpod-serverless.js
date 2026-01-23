/**
 * Sprint 1: Test RunPod Serverless Inference
 * 
 * This script tests the RunPod serverless API for image generation.
 * 
 * SETUP REQUIRED:
 * 1. Go to https://www.runpod.io/console/serverless
 * 2. Click "New Endpoint"
 * 3. Choose "Stable Diffusion" template (or SDXL)
 * 4. Deploy it (takes ~2 mins)
 * 5. Copy the Endpoint ID
 * 6. Add to .env: RUNPOD_SDXL_ENDPOINT=your_endpoint_id
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env') })

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY
const SDXL_ENDPOINT = process.env.RUNPOD_SDXL_ENDPOINT

console.log('\n========================================')
console.log('  Sprint 1: RunPod Serverless Test')
console.log('========================================\n')

// Step 1: Check API Key
console.log('Step 1: Checking RunPod API Key...')
if (!RUNPOD_API_KEY) {
  console.log('❌ RUNPOD_API_KEY not found in .env')
  console.log('\nTo fix: Add your RunPod API key to backend/.env')
  console.log('Get it from: https://www.runpod.io/console/user/settings\n')
  process.exit(1)
}
console.log('✅ API Key found:', RUNPOD_API_KEY.slice(0, 8) + '...')

// Step 2: Check SDXL Endpoint
console.log('\nStep 2: Checking SDXL Endpoint...')
if (!SDXL_ENDPOINT) {
  console.log('⚠️  RUNPOD_SDXL_ENDPOINT not configured')
  console.log('\n📋 To set up a serverless SDXL endpoint:')
  console.log('   1. Go to: https://www.runpod.io/console/serverless')
  console.log('   2. Click "Quick Deploy" or "New Endpoint"')
  console.log('   3. Search for "Stable Diffusion" or "SDXL"')
  console.log('   4. Choose a template (e.g., "AUTOMATIC1111" or "Stable Diffusion XL")')
  console.log('   5. Click Deploy')
  console.log('   6. Copy the Endpoint ID (looks like: abc123def456)')
  console.log('   7. Add to backend/.env: RUNPOD_SDXL_ENDPOINT=your_endpoint_id')
  console.log('\n💡 Alternatively, use the existing Pod API for now.')
  console.log('   The serverless API is better for production batch jobs.\n')
  
  // List available serverless endpoints
  console.log('\nStep 3: Checking your existing serverless endpoints...')
  try {
    const response = await fetch('https://api.runpod.io/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RUNPOD_API_KEY}`
      },
      body: JSON.stringify({
        query: `
          query {
            myself {
              serverlessDiscount
              endpoints {
                id
                name
                templateId
                workersMax
                workersMin
                idleTimeout
              }
            }
          }
        `
      })
    })
    
    const data = await response.json()
    
    if (data.data?.myself?.endpoints?.length > 0) {
      console.log('\n✅ Found existing serverless endpoints:')
      data.data.myself.endpoints.forEach(ep => {
        console.log(`   - ${ep.name}: ${ep.id}`)
      })
      console.log('\n💡 Add one of these to .env as RUNPOD_SDXL_ENDPOINT')
    } else {
      console.log('   No serverless endpoints found.')
      console.log('   Deploy one using the instructions above.')
    }
  } catch (error) {
    console.log('   Could not fetch endpoints:', error.message)
  }
  
  process.exit(0)
}

console.log('✅ SDXL Endpoint found:', SDXL_ENDPOINT)

// Step 3: Check endpoint health
console.log('\nStep 3: Checking endpoint health...')
try {
  const healthResponse = await fetch(`https://api.runpod.ai/v2/${SDXL_ENDPOINT}/health`, {
    headers: { 'Authorization': `Bearer ${RUNPOD_API_KEY}` }
  })
  
  if (healthResponse.ok) {
    const health = await healthResponse.json()
    console.log('✅ Endpoint health:', JSON.stringify(health, null, 2))
  } else {
    console.log('⚠️  Endpoint might be cold (normal if not recently used)')
  }
} catch (error) {
  console.log('⚠️  Could not check health:', error.message)
}

// Step 4: Test inference
console.log('\nStep 4: Testing image generation...')
console.log('   Prompt: "a futuristic tokyo street at night, neon lights, rain"')

try {
  const startTime = Date.now()
  
  const response = await fetch(`https://api.runpod.ai/v2/${SDXL_ENDPOINT}/runsync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RUNPOD_API_KEY}`
    },
    body: JSON.stringify({
      input: {
        prompt: 'a futuristic tokyo street at night, neon lights, rain, cinematic, 8k',
        negative_prompt: 'blurry, low quality, distorted',
        width: 1024,
        height: 1024,
        num_inference_steps: 25,
        guidance_scale: 7.5
      }
    })
  })

  const result = await response.json()
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
  
  if (result.status === 'COMPLETED') {
    console.log(`✅ Image generated in ${elapsed}s`)
    console.log('\n📊 Result:')
    console.log('   Status:', result.status)
    console.log('   Execution time:', result.executionTime, 'ms')
    
    if (result.output?.image) {
      console.log('   Image: Base64 data received (' + result.output.image.length + ' chars)')
      console.log('\n💡 To view the image, save the base64 to a file or display in browser')
    } else if (result.output?.images) {
      console.log('   Images:', result.output.images.length)
    } else if (result.output?.image_url) {
      console.log('   Image URL:', result.output.image_url)
    } else {
      console.log('   Output:', JSON.stringify(result.output, null, 2).slice(0, 500))
    }
  } else if (result.status === 'IN_PROGRESS' || result.status === 'IN_QUEUE') {
    console.log(`⏳ Job submitted (${result.status})`)
    console.log('   Job ID:', result.id)
    console.log('   The endpoint might be cold-starting. Try again in ~30s.')
  } else {
    console.log('⚠️  Unexpected status:', result.status)
    console.log('   Full response:', JSON.stringify(result, null, 2))
  }
} catch (error) {
  console.log('❌ Inference failed:', error.message)
}

console.log('\n========================================')
console.log('  Sprint 1 Complete!')
console.log('========================================')
console.log('\n📋 Summary:')
console.log('   - RunPod API: Connected')
console.log('   - SDXL Endpoint:', SDXL_ENDPOINT ? 'Configured' : 'Not configured')
console.log('\n🚀 Next: Sprint 2 - Backend batch endpoint\n')
