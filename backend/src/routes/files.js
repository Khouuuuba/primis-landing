/**
 * File Storage API Routes
 * 
 * Handles file upload, download, list, and delete operations
 * using Supabase Storage.
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { query } from '../db/connection.js';
import { requireAuth, flexibleAuth } from '../middleware/auth.js';
import multer from 'multer';

const router = express.Router();

// Multer config for file uploads (500MB max)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// Initialize Supabase client
function extractSupabaseUrl(dbUrl) {
  if (!dbUrl) return null;
  const match = dbUrl.match(/db\.([^.]+)\.supabase\.co/);
  if (match) {
    return `https://${match[1]}.supabase.co`;
  }
  return null;
}

function getValidSupabaseUrl() {
  // First try extracting from DATABASE_URL (most reliable)
  const fromDb = extractSupabaseUrl(process.env.DATABASE_URL);
  if (fromDb) return fromDb;
  
  // Then try SUPABASE_URL if it looks valid
  const envUrl = process.env.SUPABASE_URL;
  if (envUrl && envUrl.match(/^https?:\/\//i)) {
    return envUrl;
  }
  
  return null;
}

const supabaseUrl = getValidSupabaseUrl();
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

if (supabase) {
  console.log('✅ Files storage initialized:', supabaseUrl);
} else {
  console.warn('⚠️  Files storage not configured');
}

const BUCKET_NAME = 'user-files';
const MAX_STORAGE_BYTES = 10 * 1024 * 1024 * 1024; // 10GB per user

// Folder structure
const FOLDERS = ['datasets', 'models', 'outputs'];

// ==================== HELPERS ====================

function getUserPath(userId, folder = '') {
  return folder ? `${userId}/${folder}` : `${userId}`;
}

async function getUserStorageUsage(userId) {
  if (!supabase) return 0;
  
  try {
    let totalSize = 0;
    
    for (const folder of FOLDERS) {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(getUserPath(userId, folder));
      
      if (data && !error) {
        totalSize += data.reduce((sum, file) => sum + (file.metadata?.size || 0), 0);
      }
    }
    
    return totalSize;
  } catch (error) {
    console.error('Error calculating storage:', error);
    return 0;
  }
}

// ==================== ROUTES ====================

// GET /api/files/status - Check storage service status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    storageConfigured: !!supabase,
    bucket: BUCKET_NAME,
    maxStorageGB: MAX_STORAGE_BYTES / (1024 * 1024 * 1024),
    folders: FOLDERS,
  });
});

// GET /api/files - List all files for user
router.get('/', flexibleAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Storage not configured' });
    }
    
    const userId = req.user.id;
    const folder = req.query.folder; // Optional: filter by folder
    
    const files = [];
    const foldersToList = folder ? [folder] : FOLDERS;
    
    for (const f of foldersToList) {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(getUserPath(userId, f));
      
      if (error) {
        console.error(`Error listing ${f}:`, error);
        continue;
      }
      
      if (data) {
        files.push(...data.map(file => ({
          id: file.id,
          name: file.name,
          folder: f,
          size: file.metadata?.size || 0,
          mimeType: file.metadata?.mimetype || 'application/octet-stream',
          createdAt: file.created_at,
          updatedAt: file.updated_at,
          path: `${f}/${file.name}`,
        })));
      }
    }
    
    // Get storage usage
    const usedBytes = await getUserStorageUsage(userId);
    
    // Get folder counts for sidebar
    const folderCounts = {};
    for (const f of FOLDERS) {
      const { data } = await supabase.storage
        .from(BUCKET_NAME)
        .list(getUserPath(userId, f));
      folderCounts[f] = data?.length || 0;
    }
    
    res.json({
      success: true,
      files,
      folderCounts,
      storage: {
        usedBytes,
        usedGB: (usedBytes / (1024 * 1024 * 1024)).toFixed(2),
        maxBytes: MAX_STORAGE_BYTES,
        maxGB: MAX_STORAGE_BYTES / (1024 * 1024 * 1024),
        percentUsed: ((usedBytes / MAX_STORAGE_BYTES) * 100).toFixed(1),
      },
    });
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ success: false, error: 'Failed to list files' });
  }
});

// POST /api/files/upload - Upload a file
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Storage not configured' });
    }
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }
    
    const userId = req.user.id;
    const folder = req.body.folder || 'datasets';
    
    if (!FOLDERS.includes(folder)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid folder. Must be one of: ${FOLDERS.join(', ')}` 
      });
    }
    
    // Check storage quota
    const usedBytes = await getUserStorageUsage(userId);
    if (usedBytes + req.file.size > MAX_STORAGE_BYTES) {
      return res.status(400).json({
        success: false,
        error: 'Storage quota exceeded. Max 10GB per user.',
        storage: {
          usedGB: (usedBytes / (1024 * 1024 * 1024)).toFixed(2),
          maxGB: 10,
        },
      });
    }
    
    // Generate unique filename
    const timestamp = Date.now();
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}-${safeName}`;
    const filePath = `${getUserPath(userId, folder)}/${filename}`;
    
    // Upload to Supabase
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });
    
    if (error) {
      console.error('Upload error:', error);
      return res.status(500).json({ success: false, error: 'Upload failed: ' + error.message });
    }
    
    res.json({
      success: true,
      file: {
        name: filename,
        originalName: req.file.originalname,
        folder,
        size: req.file.size,
        mimeType: req.file.mimetype,
        path: `${folder}/${filename}`,
      },
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ success: false, error: 'Failed to upload file' });
  }
});

// GET /api/files/download/:folder/:filename - Download a file
router.get('/download/:folder/:filename', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Storage not configured' });
    }
    
    const userId = req.user.id;
    const { folder, filename } = req.params;
    
    if (!FOLDERS.includes(folder)) {
      return res.status(400).json({ success: false, error: 'Invalid folder' });
    }
    
    const filePath = `${getUserPath(userId, folder)}/${filename}`;
    
    // Get signed URL (valid for 1 hour)
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, 3600);
    
    if (error) {
      console.error('Download error:', error);
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    res.json({
      success: true,
      downloadUrl: data.signedUrl,
      expiresIn: 3600,
    });
  } catch (error) {
    console.error('Error getting download URL:', error);
    res.status(500).json({ success: false, error: 'Failed to get download URL' });
  }
});

// DELETE /api/files/:folder/:filename - Delete a file
router.delete('/:folder/:filename', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Storage not configured' });
    }
    
    const userId = req.user.id;
    const { folder, filename } = req.params;
    
    if (!FOLDERS.includes(folder)) {
      return res.status(400).json({ success: false, error: 'Invalid folder' });
    }
    
    const filePath = `${getUserPath(userId, folder)}/${filename}`;
    
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);
    
    if (error) {
      console.error('Delete error:', error);
      return res.status(500).json({ success: false, error: 'Failed to delete file' });
    }
    
    res.json({
      success: true,
      message: 'File deleted',
      path: `${folder}/${filename}`,
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ success: false, error: 'Failed to delete file' });
  }
});

// GET /api/files/usage - Get storage usage stats
router.get('/usage', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const usedBytes = await getUserStorageUsage(userId);
    
    // Get file count per folder
    const folderStats = {};
    
    if (supabase) {
      for (const folder of FOLDERS) {
        const { data } = await supabase.storage
          .from(BUCKET_NAME)
          .list(getUserPath(userId, folder));
        
        folderStats[folder] = {
          fileCount: data?.length || 0,
          bytes: data?.reduce((sum, f) => sum + (f.metadata?.size || 0), 0) || 0,
        };
      }
    }
    
    res.json({
      success: true,
      usage: {
        totalBytes: usedBytes,
        totalGB: (usedBytes / (1024 * 1024 * 1024)).toFixed(2),
        maxBytes: MAX_STORAGE_BYTES,
        maxGB: MAX_STORAGE_BYTES / (1024 * 1024 * 1024),
        percentUsed: ((usedBytes / MAX_STORAGE_BYTES) * 100).toFixed(1),
        folders: folderStats,
      },
    });
  } catch (error) {
    console.error('Error getting usage:', error);
    res.status(500).json({ success: false, error: 'Failed to get usage stats' });
  }
});

export default router;
