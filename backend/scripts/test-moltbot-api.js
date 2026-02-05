/**
 * Test Moltbot API Endpoints
 * 
 * Usage:
 *   node scripts/test-moltbot-api.js
 * 
 * Tests:
 * 1. Railway health check
 * 2. Deploy endpoint validation
 * 3. List instances
 * 4. Encryption module
 */

import 'dotenv/config'
import { encrypt, decrypt, generateKey, validateKeyConfiguration } from '../src/utils/encryption.js'

const API_BASE = process.env.API_URL || 'http://localhost:3001'
const TEST_USER_ID = 'test-moltbot-user'

console.log('═══════════════════════════════════════════════════════════')
console.log('  Moltbot API Test Suite')
console.log('  Sprint: M1.2 - Backend Integration')
console.log('═══════════════════════════════════════════════════════════\n')

// =============================================================================
// TEST: Encryption Module
// =============================================================================

async function testEncryption() {
  console.log('📦 Testing Encryption Module...\n')
  
  // Check if key is configured
  const keyValid = validateKeyConfiguration()
  
  if (!keyValid) {
    console.log('  ⚠️  MOLTBOT_ENCRYPTION_KEY not configured')
    console.log('  📝 Generate a key with:\n')
    const newKey = generateKey()
    console.log(`     MOLTBOT_ENCRYPTION_KEY=${newKey.hex}`)
    console.log('')
    console.log('  Add this to your .env file\n')
    return false
  }
  
  console.log('  ✓ Encryption key configured')
  
  // Test encrypt/decrypt cycle
  const testSecret = 'sk-ant-test123456789'
  
  try {
    const encrypted = encrypt(testSecret)
    console.log(`  ✓ Encrypted: ${encrypted.encryptedValue.substring(0, 20)}...`)
    
    const decrypted = decrypt(encrypted.encryptedValue, encrypted.iv, encrypted.authTag)
    
    if (decrypted === testSecret) {
      console.log('  ✓ Decryption successful')
      console.log('  ✓ Encryption module working!\n')
      return true
    } else {
      console.log('  ✗ Decryption mismatch!')
      return false
    }
  } catch (error) {
    console.log(`  ✗ Encryption error: ${error.message}`)
    return false
  }
}

// =============================================================================
// TEST: Railway Health Check
// =============================================================================

async function testRailwayHealth() {
  console.log('🚂 Testing Railway Health Check...\n')
  
  try {
    const response = await fetch(`${API_BASE}/api/moltbot/health`)
    const data = await response.json()
    
    console.log(`  Status: ${data.status}`)
    console.log(`  Provider: ${data.provider}`)
    
    if (data.status === 'healthy') {
      console.log(`  User ID: ${data.userId}`)
      console.log(`  Email: ${data.email}`)
      console.log('  ✓ Railway API connected!\n')
      return true
    } else {
      console.log(`  Error: ${data.error || 'Unknown'}`)
      console.log('  ⚠️  Railway not connected (API key may be missing)\n')
      return false
    }
  } catch (error) {
    console.log(`  ✗ Request failed: ${error.message}`)
    console.log('  ⚠️  Is the backend running?\n')
    return false
  }
}

// =============================================================================
// TEST: List Instances (Empty)
// =============================================================================

async function testListInstances() {
  console.log('📋 Testing List Instances...\n')
  
  try {
    const response = await fetch(`${API_BASE}/api/moltbot/instances`, {
      headers: {
        'x-privy-id': TEST_USER_ID
      }
    })
    
    if (response.status === 500) {
      const text = await response.text()
      console.log(`  ⚠️  Server error: ${text}`)
      console.log('  Note: This may be because the moltbot_instances table does not exist yet.')
      console.log('  Run the migration: backend/src/db/moltbot-schema.sql\n')
      return false
    }
    
    const data = await response.json()
    
    console.log(`  Found ${data.instances?.length || 0} instances`)
    console.log('  ✓ List endpoint working!\n')
    return true
  } catch (error) {
    console.log(`  ✗ Request failed: ${error.message}\n`)
    return false
  }
}

// =============================================================================
// TEST: Deploy Validation
// =============================================================================

async function testDeployValidation() {
  console.log('🔍 Testing Deploy Validation...\n')
  
  const testCases = [
    {
      name: 'Missing name',
      body: { aiProvider: 'anthropic', aiApiKey: 'sk-ant-xxx', channels: { telegram: { botToken: '123:abc' } } },
      expectedCode: 'INVALID_NAME'
    },
    {
      name: 'Invalid AI provider',
      body: { name: 'test', aiProvider: 'invalid', aiApiKey: 'xxx', channels: { telegram: { botToken: '123:abc' } } },
      expectedCode: 'INVALID_PROVIDER'
    },
    {
      name: 'Invalid API key format',
      body: { name: 'test', aiProvider: 'anthropic', aiApiKey: 'invalid-key', channels: { telegram: { botToken: '123:abc' } } },
      expectedCode: 'INVALID_API_KEY'
    },
    {
      name: 'No channels configured',
      body: { name: 'test', aiProvider: 'anthropic', aiApiKey: 'sk-ant-validkey123', channels: {} },
      expectedCode: 'NO_CHANNELS'
    }
  ]
  
  let passed = 0
  
  for (const testCase of testCases) {
    try {
      const response = await fetch(`${API_BASE}/api/moltbot/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-privy-id': TEST_USER_ID
        },
        body: JSON.stringify(testCase.body)
      })
      
      const data = await response.json()
      
      if (data.code === testCase.expectedCode) {
        console.log(`  ✓ ${testCase.name}: Got expected error (${testCase.expectedCode})`)
        passed++
      } else {
        console.log(`  ✗ ${testCase.name}: Expected ${testCase.expectedCode}, got ${data.code || data.error}`)
      }
    } catch (error) {
      console.log(`  ✗ ${testCase.name}: Request failed - ${error.message}`)
    }
  }
  
  console.log(`\n  Passed: ${passed}/${testCases.length} validation tests\n`)
  return passed === testCases.length
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const results = {
    encryption: await testEncryption(),
    railwayHealth: await testRailwayHealth(),
    listInstances: await testListInstances(),
    deployValidation: await testDeployValidation()
  }
  
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  RESULTS SUMMARY')
  console.log('═══════════════════════════════════════════════════════════\n')
  
  const total = Object.keys(results).length
  const passed = Object.values(results).filter(Boolean).length
  
  for (const [test, result] of Object.entries(results)) {
    console.log(`  ${result ? '✓' : '✗'} ${test}`)
  }
  
  console.log(`\n  Total: ${passed}/${total} tests passed`)
  
  if (passed < total) {
    console.log('\n  ⚠️  Some tests failed. Check:')
    if (!results.encryption) console.log('     - Set MOLTBOT_ENCRYPTION_KEY in .env')
    if (!results.railwayHealth) console.log('     - Set RAILWAY_API_KEY in .env')
    if (!results.listInstances) console.log('     - Run moltbot-schema.sql migration')
  }
  
  console.log('\n═══════════════════════════════════════════════════════════\n')
}

main().catch(console.error)
