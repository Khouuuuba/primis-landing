/**
 * Bob the Builder API Routes
 * 
 * Endpoints for AI-powered app building:
 * - POST /api/bob/classify    — Classify app type from description
 * - POST /api/bob/generate    — Generate app code from spec
 * - POST /api/bob/validate    — Validate generated code
 * - GET  /api/bob/templates   — List available templates
 */

import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { 
  createRateLimitedClient, 
  getRateLimitStatus, 
  isRateLimitError,
  estimateTokenCount
} from '../utils/anthropic-rate-limiter.js'

const router = Router()

// Initialize Anthropic client with rate limiting
const rawAnthropicClient = process.env.ANTHROPIC_API_KEY 
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

// Wrap with rate limiter for automatic retry/backoff on 429 errors
const anthropic = createRateLimitedClient(rawAnthropicClient)

// App type definitions
const APP_TYPES = {
  booking: {
    label: 'Booking & Scheduling',
    icon: '📅',
    description: 'Let clients book appointments with you',
    keywords: ['appointment', 'book', 'schedule', 'calendar', 'reservation', 'grooming', 'salon', 'spa']
  },
  directory: {
    label: 'Directory & Listings',
    icon: '📋',
    description: 'Create a searchable directory',
    keywords: ['directory', 'list', 'find', 'search', 'catalog', 'listings']
  },
  waitlist: {
    label: 'Waitlist & Launch',
    icon: '🚀',
    description: 'Collect signups for your launch',
    keywords: ['waitlist', 'signup', 'launch', 'coming soon', 'early access', 'beta']
  },
  portfolio: {
    label: 'Portfolio & Showcase',
    icon: '🎨',
    description: 'Show off your work beautifully',
    keywords: ['portfolio', 'showcase', 'gallery', 'work', 'projects', 'photography']
  },
  store: {
    label: 'Simple Store',
    icon: '🛒',
    description: 'Sell products online',
    keywords: ['sell', 'shop', 'store', 'products', 'buy', 'ecommerce']
  },
  event: {
    label: 'Event Registration',
    icon: '🎟️',
    description: 'Manage event signups',
    keywords: ['event', 'registration', 'rsvp', 'workshop', 'conference', 'ticket']
  },
  membership: {
    label: 'Membership Site',
    icon: '👥',
    description: 'Build a members-only community',
    keywords: ['members', 'subscription', 'community', 'course', 'paywall']
  },
  internal: {
    label: 'Internal Tool',
    icon: '🔧',
    description: 'Team tools and trackers',
    keywords: ['team', 'internal', 'tracker', 'inventory', 'employee', 'dashboard']
  }
}

/**
 * POST /api/bob/classify
 * Classify app type from user description
 */
router.post('/classify', async (req, res) => {
  try {
    const { description } = req.body
    
    if (!description) {
      return res.status(400).json({ success: false, error: 'Description required' })
    }

    // Try AI classification first
    if (anthropic) {
      try {
        const aiResult = await classifyWithAI(description)
        if (aiResult.type) {
          return res.json({
            success: true,
            method: 'ai',
            ...aiResult,
            ...APP_TYPES[aiResult.type]
          })
        }
      } catch (aiError) {
        // On rate limit errors, fall back to keyword classification gracefully
        const errorType = isRateLimitError(aiError) ? 'Rate limited' : 'Error'
        console.error(`AI classification failed (${errorType}), falling back to keywords:`, aiError.message)
      }
    }

    // Fallback to keyword classification
    const result = classifyWithKeywords(description)
    
    res.json({
      success: result.type !== null,
      method: 'keywords',
      ...result
    })

  } catch (error) {
    console.error('Classification error:', error)
    res.status(500).json({ success: false, error: 'Classification failed' })
  }
})

/**
 * POST /api/bob/generate
 * Generate app code from spec
 */
router.post('/generate', async (req, res) => {
  try {
    const { spec } = req.body
    
    if (!spec || !spec.type) {
      return res.status(400).json({ success: false, error: 'App spec with type required' })
    }

    if (!anthropic) {
      return res.status(503).json({ 
        success: false, 
        error: 'AI service not configured',
        hint: 'Set ANTHROPIC_API_KEY environment variable'
      })
    }

    console.log(`Generating ${spec.type} app:`, spec)

    // Generate code with Claude (rate limiter handles retries automatically)
    const generatedCode = await generateAppCode(spec)
    
    res.json({
      success: true,
      code: generatedCode,
      spec
    })

  } catch (error) {
    console.error('Generation error:', error)
    
    // Return a user-friendly error for rate limit issues
    if (isRateLimitError(error)) {
      return res.status(429).json({
        success: false,
        error: 'AI service is temporarily busy. Please try again in a minute.',
        retryAfter: 60,
        code: 'RATE_LIMITED'
      })
    }
    
    res.status(500).json({ success: false, error: error.message || 'Code generation failed' })
  }
})

/**
 * POST /api/bob/validate
 * Validate generated code
 */
router.post('/validate', async (req, res) => {
  try {
    const { code } = req.body
    
    if (!code) {
      return res.status(400).json({ success: false, error: 'Code required' })
    }

    const validation = validateCode(code)
    
    res.json({
      success: validation.valid,
      ...validation
    })

  } catch (error) {
    console.error('Validation error:', error)
    res.status(500).json({ success: false, error: 'Validation failed' })
  }
})

/**
 * GET /api/bob/templates
 * List available app templates
 */
router.get('/templates', (req, res) => {
  const templates = Object.entries(APP_TYPES).map(([id, config]) => ({
    id,
    ...config
  }))
  
  res.json({ templates })
})

/**
 * GET /api/bob/health
 * Check Bob API health and rate limit status
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    aiEnabled: !!anthropic,
    templates: Object.keys(APP_TYPES).length,
    rateLimits: getRateLimitStatus()
  })
})

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Classify app type using AI
 */
async function classifyWithAI(description) {
  // Truncate description to prevent excessive token usage
  const truncatedDesc = description.length > 500 ? description.substring(0, 500) + '...' : description
  
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 50,
    messages: [{
      role: 'user',
      content: `Classify into ONE category: booking, directory, waitlist, portfolio, store, event, membership, internal.

"${truncatedDesc}"

Reply with ONLY the category name (one word). If unclear: "unknown".`
    }]
  }, { operationName: 'bob-classify' })

  const type = message.content[0].text.trim().toLowerCase()
  
  if (APP_TYPES[type]) {
    return { type }
  }
  
  return { type: null }
}

/**
 * Classify app type using keywords
 */
function classifyWithKeywords(description) {
  const lowerDesc = description.toLowerCase()
  
  for (const [type, config] of Object.entries(APP_TYPES)) {
    for (const keyword of config.keywords) {
      if (lowerDesc.includes(keyword)) {
        return {
          type,
          ...config
        }
      }
    }
  }
  
  return { type: null }
}

/**
 * Generate app code using Claude
 */
async function generateAppCode(spec) {
  const prompt = buildCodeGenPrompt(spec)
  
  // Estimate tokens to help rate limiter make informed decisions
  const estimatedTokens = estimateTokenCount(prompt)
  console.log(`[bob/generate] Estimated input tokens: ${estimatedTokens}`)
  
  // Use sonnet for code generation - it's faster, cheaper, and has higher rate limits
  // Opus has only 30k input tokens/min which is too low for code gen prompts
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: prompt
    }]
  }, { operationName: 'bob-generate-code' })

  const responseText = message.content[0].text
  
  // Parse the response into files
  const files = parseGeneratedCode(responseText)
  
  return {
    files,
    raw: responseText
  }
}

/**
 * Build the code generation prompt
 */
function buildCodeGenPrompt(spec) {
  // Compact spec - only include non-empty values to reduce tokens
  const compactSpec = Object.fromEntries(
    Object.entries(spec).filter(([_, v]) => v !== undefined && v !== null && v !== '')
  )

  const basePrompt = `Generate a production-ready React+Vite+Tailwind web app.

Stack: React 18, Vite, Tailwind CSS, Express.js backend, Supabase.

Spec: ${JSON.stringify(compactSpec)}

Rules: Modern React (hooks), mobile-responsive, error handling, loading states, clean design.

Format each file as:
--- FILE: path/to/file.ext ---
\`\`\`lang
content
\`\`\`

Generate: App.jsx, index.css (Tailwind), components, package.json, tailwind.config.js, schema.sql.`

  // Add template-specific instructions (kept concise)
  const templateInstructions = getTemplateInstructions(spec.type, spec)
  
  return basePrompt + '\n\n' + templateInstructions
}

/**
 * Get template-specific generation instructions
 */
function getTemplateInstructions(type, spec) {
  // Concise template instructions to minimize token usage
  const instructions = {
    booking: `Booking app: service selection, date picker, confirmation. Services: ${spec.services || 'TBD'}. Business: ${spec.businessName || 'My Business'}. Payment: ${spec.payments || 'Pay at appointment'}. Accounts: ${spec.clientAccounts || 'Guest'}.`,
    waitlist: `Waitlist: hero + email capture. ${spec.referrals?.includes('Yes') ? 'Referral system with codes.' : 'Simple signup.'} ${spec.launchDate?.includes('Yes') ? 'Countdown timer.' : 'Coming Soon.'} Name: ${spec.productName || 'Our Product'}. Tagline: ${spec.tagline || 'Something amazing is coming'}.`,
    portfolio: `Portfolio: hero, ${spec.projectTypes || 'visual'} gallery, about, contact (${spec.contact || 'form'}). Name: ${spec.name || 'Your Name'}. Role: ${spec.profession || 'Creative Professional'}.`,
    store: `Store: product grid, cart, Stripe checkout, order confirmation.`,
    event: `Event: details hero, registration form, ticket selection, confirmation.`,
    directory: `Directory: search bar, listing cards, filters, detail modal.`,
    membership: `Membership: landing page, login/signup, protected area, subscription tiers.`,
    internal: `Internal tool: dashboard metrics, data table, add/edit forms, simple auth.`
  }

  return instructions[type] || ''
}

/**
 * Parse generated code into file objects
 */
function parseGeneratedCode(responseText) {
  const files = []
  const fileRegex = /--- FILE: (.+?) ---\s*```(\w+)?\s*([\s\S]*?)```/g
  
  let match
  while ((match = fileRegex.exec(responseText)) !== null) {
    const [, path, language, content] = match
    files.push({
      path: path.trim(),
      language: language || 'text',
      content: content.trim()
    })
  }
  
  // If no files found with the format, try to extract code blocks
  if (files.length === 0) {
    const codeBlockRegex = /```(\w+)?\s*([\s\S]*?)```/g
    let index = 0
    while ((match = codeBlockRegex.exec(responseText)) !== null) {
      const [, language, content] = match
      files.push({
        path: `generated-${index}.${language || 'txt'}`,
        language: language || 'text',
        content: content.trim()
      })
      index++
    }
  }
  
  return files
}

/**
 * Validate generated code
 */
function validateCode(code) {
  const issues = []
  
  // Check if we have files
  if (!code.files || code.files.length === 0) {
    issues.push({ type: 'error', message: 'No files generated' })
    return { valid: false, issues }
  }
  
  // Check for required files
  const filePaths = code.files.map(f => f.path)
  
  if (!filePaths.some(p => p.includes('App.jsx') || p.includes('App.js'))) {
    issues.push({ type: 'warning', message: 'Missing App.jsx' })
  }
  
  if (!filePaths.some(p => p.includes('package.json'))) {
    issues.push({ type: 'warning', message: 'Missing package.json' })
  }
  
  // Basic syntax checks
  for (const file of code.files) {
    if (file.path.endsWith('.jsx') || file.path.endsWith('.js')) {
      // Check for common issues
      if (file.content.includes('import React') && !file.content.includes('from')) {
        issues.push({ type: 'error', message: `Incomplete import in ${file.path}` })
      }
    }
  }
  
  return {
    valid: issues.filter(i => i.type === 'error').length === 0,
    issues,
    fileCount: code.files.length
  }
}

export default router
