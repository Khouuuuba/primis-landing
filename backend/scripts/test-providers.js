/**
 * Test Provider System
 * 
 * Verifies that the unified provider interface works correctly.
 * Run with: node scripts/test-providers.js
 */

// Load dotenv FIRST before any other imports
import dotenv from 'dotenv'
dotenv.config()

// Dynamic import so providers see the env vars
const providers = await import('../src/providers/index.js').then(m => m.default)

async function test() {
  console.log('\n🧪 Testing Provider System\n')
  console.log('═'.repeat(60))

  // Test 1: Check provider health
  console.log('\n1️⃣  Checking provider health...')
  try {
    const health = await providers.getAllProviderHealth()
    health.forEach(h => {
      const icon = h.status === 'healthy' ? '✅' : h.status === 'degraded' ? '⚠️' : '❌'
      console.log(`   ${icon} ${h.provider}: ${h.status} (${h.latencyMs}ms)`)
      if (h.message && h.status !== 'healthy') {
        console.log(`      └─ ${h.message}`)
      }
    })
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
  }

  // Test 2: List GPU offerings from ALL providers
  console.log('\n2️⃣  Listing ALL GPU offerings...')
  try {
    const gpus = await providers.getAllGPUOfferings()
    console.log(`   📊 Found ${gpus.length} GPU offerings across all providers:\n`)
    
    // Group by provider
    const byProvider = {}
    gpus.forEach(gpu => {
      if (!byProvider[gpu.provider]) byProvider[gpu.provider] = []
      byProvider[gpu.provider].push(gpu)
    })
    
    for (const [provider, providerGpus] of Object.entries(byProvider)) {
      console.log(`   📦 ${provider.toUpperCase()} (${providerGpus.length} GPUs):`)
      providerGpus.slice(0, 5).forEach(gpu => {
        const available = gpu.available ? '✅' : '⏳'
        const savings = gpu.savings ? ` (${gpu.savings}% off)` : ''
        console.log(`      ${available} ${gpu.gpuType} (${gpu.vramGb}GB) - $${gpu.pricePerHour.toFixed(2)}/hr${savings}`)
      })
      if (providerGpus.length > 5) {
        console.log(`      ... and ${providerGpus.length - 5} more`)
      }
      console.log()
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
  }

  // Test 3: List model offerings (ALL providers)
  console.log('\n3️⃣  Listing ALL model offerings...')
  try {
    const models = await providers.getAllModelOfferings()
    console.log(`   📊 Found ${models.length} models across all providers:\n`)
    
    // Group by provider
    const byProvider = {}
    models.forEach(m => {
      if (!byProvider[m.provider]) byProvider[m.provider] = []
      byProvider[m.provider].push(m)
    })
    
    for (const [provider, providerModels] of Object.entries(byProvider)) {
      console.log(`   📦 ${provider.toUpperCase()} (${providerModels.length} models):`)
      providerModels.forEach(model => {
        const icon = model.available ? '✅' : '⏳'
        const price = model.outputPrice 
          ? `$${model.inputPrice}/$${model.outputPrice}` 
          : `$${model.inputPrice}`
        console.log(`      ${icon} ${model.name} (${model.category}) - ${price} per ${model.priceUnit}`)
      })
      console.log()
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
  }

  // Test 4: Find best text model
  console.log('\n4️⃣  Finding cheapest text model...')
  try {
    const recommendations = await providers.findBestModel({ category: 'text' })
    if (recommendations.length > 0) {
      const best = recommendations[0]
      console.log(`   🏆 Cheapest: ${best.name}`)
      console.log(`      Provider: ${best.provider}`)
      console.log(`      Price: $${best.inputPrice}/${best.priceUnit}`)
      console.log(`      Context: ${best.contextLength?.toLocaleString() || 'N/A'} tokens`)
      console.log(`      Available: ${best.available ? 'Yes' : 'No (needs API key)'}`)
    } else {
      console.log(`   ⚠️ No text models found`)
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
  }

  // Test 5: Find best embedding model
  console.log('\n5️⃣  Finding cheapest embedding model...')
  try {
    const recommendations = await providers.findBestModel({ category: 'embedding' })
    if (recommendations.length > 0) {
      const best = recommendations[0]
      console.log(`   🏆 Cheapest: ${best.name}`)
      console.log(`      Provider: ${best.provider}`)
      console.log(`      Price: $${best.inputPrice}/${best.priceUnit}`)
      console.log(`      Dimensions: ${best.metadata?.dimensions || 'N/A'}`)
      console.log(`      Available: ${best.available ? 'Yes' : 'No (needs API key)'}`)
    } else {
      console.log(`   ⚠️ No embedding models found`)
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
  }

  // Test 6: GPU Price Comparison
  console.log('\n6️⃣  GPU Price Comparison (per hour):')
  try {
    const gpus = await providers.getAllGPUOfferings()
    
    console.log(`\n   ${'─'.repeat(65)}`)
    console.log(`   ${'GPU'.padEnd(20)} ${'Provider'.padEnd(12)} ${'Price'.padEnd(12)} ${'VRAM'.padEnd(8)} ${'Savings'}`)
    console.log(`   ${'─'.repeat(65)}`)
    
    // Show cheapest GPUs
    gpus
      .filter(g => g.vramGb >= 16) // Only 16GB+ for meaningful comparison
      .slice(0, 12)
      .forEach(g => {
        const savings = g.savings ? `${g.savings}%` : '-'
        console.log(`   ${g.gpuType.substring(0, 19).padEnd(20)} ${g.provider.padEnd(12)} $${g.pricePerHour.toFixed(2).padEnd(10)} ${(g.vramGb + 'GB').padEnd(8)} ${savings}`)
      })
    console.log(`   ${'─'.repeat(65)}`)
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
  }

  // Test 7: Text Model Price Comparison
  console.log('\n7️⃣  Text Model Price Comparison (per 1M tokens):')
  try {
    const models = await providers.getAllModelOfferings()
    const textModels = models.filter(m => m.category === 'text')
    
    console.log(`\n   ${'─'.repeat(55)}`)
    console.log(`   ${'Model'.padEnd(30)} ${'Provider'.padEnd(12)} ${'Price'.padEnd(10)}`)
    console.log(`   ${'─'.repeat(55)}`)
    
    textModels
      .sort((a, b) => a.inputPrice - b.inputPrice)
      .slice(0, 8)
      .forEach(m => {
        console.log(`   ${m.name.substring(0, 29).padEnd(30)} ${m.provider.padEnd(12)} $${m.inputPrice.toFixed(2)}`)
      })
    console.log(`   ${'─'.repeat(55)}`)
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
  }

  console.log('\n' + '═'.repeat(60))
  console.log('✅ Provider system test complete!\n')
}

test().catch(console.error)
