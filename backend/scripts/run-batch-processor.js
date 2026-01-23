/**
 * Run the batch processor
 * Usage: node scripts/run-batch-processor.js
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env') })

import { startProcessor } from '../src/batch-processor.js'

startProcessor()
