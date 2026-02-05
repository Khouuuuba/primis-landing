/**
 * Encryption Utilities for Moltbot Secrets
 * 
 * Uses AES-256-GCM for authenticated encryption.
 * 
 * Security features:
 * - 256-bit key from environment variable
 * - Random 12-byte IV per encryption (unique per secret)
 * - 128-bit authentication tag (prevents tampering)
 * - No plaintext ever logged or returned in API
 */

import crypto from 'crypto'

// Algorithm configuration
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12  // 96 bits for GCM
const AUTH_TAG_LENGTH = 16  // 128 bits
const KEY_LENGTH = 32  // 256 bits

/**
 * Get encryption key from environment
 * Key must be 32 bytes (256 bits), provided as hex or base64
 */
function getEncryptionKey() {
  const keyEnv = process.env.MOLTBOT_ENCRYPTION_KEY
  
  if (!keyEnv) {
    throw new Error('MOLTBOT_ENCRYPTION_KEY environment variable is required')
  }
  
  // Try to parse as hex first (64 characters)
  if (keyEnv.length === 64) {
    return Buffer.from(keyEnv, 'hex')
  }
  
  // Try base64 (44 characters with padding)
  if (keyEnv.length === 44 || keyEnv.length === 43) {
    return Buffer.from(keyEnv, 'base64')
  }
  
  // Raw key (must be exactly 32 bytes)
  const rawKey = Buffer.from(keyEnv, 'utf-8')
  if (rawKey.length !== KEY_LENGTH) {
    throw new Error(`MOLTBOT_ENCRYPTION_KEY must be ${KEY_LENGTH} bytes (got ${rawKey.length}). Use 64 hex chars or 44 base64 chars.`)
  }
  
  return rawKey
}

/**
 * Encrypt a plaintext string
 * 
 * @param {string} plaintext - The secret to encrypt
 * @returns {Object} { encryptedValue, iv, authTag } - all as base64 strings
 */
export function encrypt(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a non-empty string')
  }
  
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  })
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final()
  ])
  
  const authTag = cipher.getAuthTag()
  
  return {
    encryptedValue: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  }
}

/**
 * Decrypt an encrypted secret
 * 
 * @param {string} encryptedValue - base64 encoded encrypted data
 * @param {string} iv - base64 encoded initialization vector
 * @param {string} authTag - base64 encoded authentication tag
 * @returns {string} The decrypted plaintext
 */
export function decrypt(encryptedValue, iv, authTag) {
  if (!encryptedValue || !iv || !authTag) {
    throw new Error('encryptedValue, iv, and authTag are all required')
  }
  
  const key = getEncryptionKey()
  
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'base64'),
    { authTagLength: AUTH_TAG_LENGTH }
  )
  
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final()
  ])
  
  return decrypted.toString('utf-8')
}

/**
 * Generate a new encryption key
 * Call this once to generate MOLTBOT_ENCRYPTION_KEY
 * 
 * @returns {Object} { hex, base64 } - key in both formats
 */
export function generateKey() {
  const key = crypto.randomBytes(KEY_LENGTH)
  return {
    hex: key.toString('hex'),
    base64: key.toString('base64')
  }
}

/**
 * Validate that the encryption key is properly configured
 * @returns {boolean} true if key is valid
 */
export function validateKeyConfiguration() {
  try {
    const key = getEncryptionKey()
    return key.length === KEY_LENGTH
  } catch {
    return false
  }
}

/**
 * Mask a secret for logging/display
 * Shows first 4 and last 4 characters
 * 
 * @param {string} secret - The secret to mask
 * @returns {string} Masked secret like "sk-a...xyz"
 */
export function maskSecret(secret) {
  if (!secret || secret.length < 12) {
    return '***'
  }
  return `${secret.substring(0, 4)}...${secret.substring(secret.length - 4)}`
}

// Export for testing
export default {
  encrypt,
  decrypt,
  generateKey,
  validateKeyConfiguration,
  maskSecret
}
