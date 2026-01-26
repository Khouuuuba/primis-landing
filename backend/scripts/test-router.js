/**
 * Test Smart Routing Engine
 * 
 * Verifies that the routing recommendations are accurate.
 * Run with: node scripts/test-router.js
 */

import dotenv from 'dotenv'
import providers from '../src/providers/index.js'
import { 
  getGPURecommendations, 
  getModelRecommendations, 
  getQuickRecommendation,
  comparePrices 
} from '../src/providers/router.js'

dotenv.config()

async function test() {
  console.log('\n🧠 Testing Smart Routing Engine\n')
  console.log('═'.repeat(70))

  // Test 1: GPU Recommendations - Cheapest Strategy
  console.log('\n1️⃣  GPU Recommendations (cheapest strategy, 24GB+ VRAM)...')
  try {
    const result = await getGPURecommendations(
      { minVram: 24, strategy: 'cheapest', limit: 5 },
      providers.getAllGPUOfferings,
      providers.getAllProviderHealth
    )
    
    console.log(`   📊 Found ${result.total} GPUs, showing top ${result.recommendations.length}:\n`)
    result.recommendations.forEach((gpu, i) => {
      const badge = gpu.isRecommended ? '🏆' : '  '
      console.log(`   ${badge} ${i+1}. ${gpu.gpuType} (${gpu.vramGb}GB) - $${gpu.pricePerHour.toFixed(2)}/hr [${gpu.provider}]`)
      console.log(`      Score: ${gpu.score} | Savings: ${gpu.savings || 0}% | Available: ${gpu.available ? 'Yes' : 'No'}`)
    })
    console.log(`\n   Strategy: ${result.strategy} | Cached: ${result.cached}`)
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
  }

  // Test 2: GPU Recommendations - Reliable Strategy
  console.log('\n2️⃣  GPU Recommendations (reliable strategy, 48GB+ VRAM)...')
  try {
    const result = await getGPURecommendations(
      { minVram: 48, strategy: 'reliable', limit: 3 },
      providers.getAllGPUOfferings,
      providers.getAllProviderHealth
    )
    
    console.log(`   📊 Found ${result.total} GPUs:\n`)
    result.recommendations.forEach((gpu, i) => {
      const badge = gpu.isRecommended ? '🏆' : '  '
      console.log(`   ${badge} ${i+1}. ${gpu.gpuType} - $${gpu.pricePerHour.toFixed(2)}/hr [${gpu.provider}]`)
      console.log(`      Score: ${gpu.score} | Reliability: ${(gpu.reliability || 0.7).toFixed(2)}`)
    })
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
  }

  // Test 3: Model Recommendations - Text
  console.log('\n3️⃣  Model Recommendations (text, cheapest)...')
  try {
    const result = await getModelRecommendations(
      { category: 'text', strategy: 'cheapest', limit: 5 },
      providers.getAllModelOfferings,
      providers.getAllProviderHealth
    )
    
    console.log(`   📊 Found ${result.total} text models:\n`)
    result.recommendations.forEach((model, i) => {
      const badge = model.isRecommended ? '🏆' : '  '
      const context = model.contextLength ? ` (${(model.contextLength/1000).toFixed(0)}K ctx)` : ''
      console.log(`   ${badge} ${i+1}. ${model.name}${context} - $${model.inputPrice}/${model.priceUnit} [${model.provider}]`)
      console.log(`      Score: ${model.score} | Available: ${model.available ? 'Yes' : 'No'}`)
    })
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
  }

  // Test 4: Model Recommendations - Embedding
  console.log('\n4️⃣  Model Recommendations (embedding)...')
  try {
    const result = await getModelRecommendations(
      { category: 'embedding', limit: 3 },
      providers.getAllModelOfferings,
      providers.getAllProviderHealth
    )
    
    console.log(`   📊 Found ${result.total} embedding models:\n`)
    result.recommendations.forEach((model, i) => {
      const badge = model.isRecommended ? '🏆' : '  '
      console.log(`   ${badge} ${i+1}. ${model.name} - $${model.inputPrice}/${model.priceUnit} [${model.provider}]`)
    })
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
  }

  // Test 5: Quick Recommendations
  console.log('\n5️⃣  Quick Recommendations (use cases)...')
  const useCases = ['inference-small', 'training-large', 'chat-fast', 'embedding']
  
  for (const useCase of useCases) {
    try {
      const result = await getQuickRecommendation(
        useCase,
        providers.getAllGPUOfferings,
        providers.getAllModelOfferings,
        providers.getAllProviderHealth
      )
      
      if (result.recommendation) {
        const name = result.recommendation.name || result.recommendation.gpuType
        const price = result.recommendation.pricePerHour || result.recommendation.inputPrice
        const unit = result.type === 'gpu' ? '/hr' : `/${result.recommendation.priceUnit || 'unit'}`
        console.log(`   ✅ ${useCase}: ${name} @ $${price}${unit} [${result.recommendation.provider}]`)
      } else {
        console.log(`   ⚠️ ${useCase}: No recommendation available`)
      }
    } catch (error) {
      console.log(`   ❌ ${useCase}: ${error.message}`)
    }
  }

  // Test 6: Price Comparison
  console.log('\n6️⃣  Price Comparison (RTX 4090 across providers)...')
  try {
    const result = await comparePrices('RTX 4090', providers.getAllGPUOfferings)
    
    if (result.found) {
      console.log(`\n   ${'─'.repeat(50)}`)
      console.log(`   ${'Provider'.padEnd(15)} ${'Price/hr'.padEnd(12)} ${'Available'}`)
      console.log(`   ${'─'.repeat(50)}`)
      
      result.providers.forEach(p => {
        console.log(`   ${p.provider.padEnd(15)} $${p.pricePerHour.toFixed(2).padEnd(10)} ${p.available ? '✅' : '⏳'}`)
      })
      console.log(`   ${'─'.repeat(50)}`)
      console.log(`\n   💡 ${result.recommendation}`)
    } else {
      console.log(`   ⚠️ ${result.message}`)
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
  }

  // Test 7: Caching verification
  console.log('\n7️⃣  Cache Verification...')
  try {
    const start1 = Date.now()
    await getGPURecommendations(
      { minVram: 8 },
      providers.getAllGPUOfferings,
      providers.getAllProviderHealth
    )
    const time1 = Date.now() - start1
    
    const start2 = Date.now()
    const result2 = await getGPURecommendations(
      { minVram: 8 },
      providers.getAllGPUOfferings,
      providers.getAllProviderHealth
    )
    const time2 = Date.now() - start2
    
    console.log(`   First request: ${time1}ms`)
    console.log(`   Second request (cached): ${time2}ms`)
    console.log(`   Cache hit: ${result2.cached ? '✅ Yes' : '❌ No'}`)
    console.log(`   Speedup: ${time1 > 0 ? ((time1 - time2) / time1 * 100).toFixed(0) : 0}%`)
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
  }

  console.log('\n' + '═'.repeat(70))
  console.log('✅ Smart Routing tests complete!\n')
}

test().catch(console.error)
