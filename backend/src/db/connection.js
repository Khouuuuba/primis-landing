import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load .env from backend root (2 levels up from src/db/)
dotenv.config({ path: join(__dirname, '../../.env') })

const { Pool } = pg

// Create connection pool
// Try without SSL first, then with SSL if needed
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false, // Supabase direct connection may not require SSL
  statement_timeout: 300000, // 5 minutes for batch processing
  query_timeout: 300000
})

// Test connection
export async function testConnection() {
  try {
    const client = await pool.connect()
    const result = await client.query('SELECT NOW()')
    client.release()
    console.log('✅ Database connected:', result.rows[0].now)
    return true
  } catch (error) {
    console.error('❌ Database connection error:', error.message)
    return false
  }
}

// Helper: Execute query with error handling
export async function query(text, params) {
  const start = Date.now()
  try {
    const result = await pool.query(text, params)
    const duration = Date.now() - start
    if (duration > 100) {
      console.log(`Slow query (${duration}ms):`, text.substring(0, 50))
    }
    return result
  } catch (error) {
    console.error('Query error:', error.message)
    throw error
  }
}

export default pool
