/**
 * Supabase Storage for batch job results
 * Stores generated images and returns public URLs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

// Extract Supabase URL from DATABASE_URL
// Format: postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
function getSupabaseUrl() {
  const dbUrl = process.env.DATABASE_URL || ''
  const match = dbUrl.match(/db\.([^.]+)\.supabase\.co/)
  if (match) {
    return `https://${match[1]}.supabase.co`
  }
  return process.env.SUPABASE_URL || null
}

const SUPABASE_URL = getSupabaseUrl()
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY

let supabase = null

if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  console.log('✅ Supabase storage initialized:', SUPABASE_URL)
} else {
  console.warn('⚠️  Supabase storage not configured. Images will be stored as base64 in database.')
}

const BUCKET_NAME = 'batch-results'

/**
 * Initialize storage bucket (run once)
 */
export async function initBucket() {
  if (!supabase) return false

  try {
    // Check if bucket exists
    const { data: buckets } = await supabase.storage.listBuckets()
    const exists = buckets?.some(b => b.name === BUCKET_NAME)

    if (!exists) {
      // Create bucket
      const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 10485760 // 10MB
      })
      
      if (error && !error.message.includes('already exists')) {
        console.error('Failed to create bucket:', error)
        return false
      }
      console.log('✅ Storage bucket created:', BUCKET_NAME)
    }

    return true
  } catch (error) {
    console.error('Bucket init error:', error)
    return false
  }
}

/**
 * Upload an image to storage
 * @param {string} base64Data - Base64 encoded image data
 * @param {string} jobId - Batch job ID
 * @param {string} itemId - Batch item ID
 * @returns {string|null} Public URL or null if failed
 */
export async function uploadImage(base64Data, jobId, itemId) {
  if (!supabase) {
    // Return base64 as data URL if no storage configured
    return `data:image/png;base64,${base64Data}`
  }

  try {
    // Remove data URL prefix if present
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '')
    
    // Convert base64 to buffer
    const buffer = Buffer.from(cleanBase64, 'base64')
    
    // Generate filename
    const filename = `${jobId}/${itemId}.png`

    // Upload to Supabase
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, buffer, {
        contentType: 'image/png',
        upsert: true
      })

    if (error) {
      console.error('Upload error:', error)
      return null
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filename)

    return urlData.publicUrl
  } catch (error) {
    console.error('Upload failed:', error)
    return null
  }
}

/**
 * Delete images for a batch job
 */
export async function deleteJobImages(jobId) {
  if (!supabase) return

  try {
    const { data: files } = await supabase.storage
      .from(BUCKET_NAME)
      .list(jobId)

    if (files && files.length > 0) {
      const paths = files.map(f => `${jobId}/${f.name}`)
      await supabase.storage.from(BUCKET_NAME).remove(paths)
    }
  } catch (error) {
    console.error('Delete failed:', error)
  }
}

export default {
  initBucket,
  uploadImage,
  deleteJobImages
}
