/**
 * Run Moltbot database migration
 */
import { query } from '../src/db/connection.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function runMigration() {
  try {
    console.log('🔄 Running Moltbot schema migration...')
    
    const schemaPath = path.join(__dirname, '../src/db/moltbot-schema.sql')
    const schema = fs.readFileSync(schemaPath, 'utf8')
    
    await query(schema)
    
    console.log('✅ Moltbot schema created successfully!')
    console.log('   - moltbot_instances table')
    console.log('   - moltbot_secrets table')
    console.log('   - moltbot_deployment_logs table')
    
  } catch (error) {
    console.error('❌ Migration error:', error.message)
  }
  
  process.exit(0)
}

runMigration()
