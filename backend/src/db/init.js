import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { pool, testConnection } from './connection.js'
import dotenv from 'dotenv'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function initDatabase() {
  console.log('🗄️  Initializing Primis database...\n')
  
  // Test connection first
  const connected = await testConnection()
  if (!connected) {
    console.error('❌ Cannot connect to database. Check DATABASE_URL in .env')
    process.exit(1)
  }
  
  try {
    // Read schema file
    const schemaPath = join(__dirname, 'schema.sql')
    const schema = readFileSync(schemaPath, 'utf-8')
    
    console.log('📋 Running schema...')
    
    // Execute schema
    await pool.query(schema)
    
    console.log('✅ Database schema created successfully!\n')
    
    // Verify tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)
    
    console.log('📊 Created tables:')
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`)
    })
    
    // Verify views
    const viewsResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)
    
    console.log('\n📈 Created views:')
    viewsResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`)
    })
    
    console.log('\n✨ Database initialization complete!')
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

initDatabase()
