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

const router = Router()

// Initialize Anthropic client
const anthropic = process.env.ANTHROPIC_API_KEY 
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

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
        console.error('AI classification failed, falling back to keywords:', aiError.message)
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

    // Generate code with Claude
    const generatedCode = await generateAppCode(spec)
    
    res.json({
      success: true,
      code: generatedCode,
      spec
    })

  } catch (error) {
    console.error('Generation error:', error)
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
 * Check Bob API health
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    aiEnabled: !!anthropic,
    templates: Object.keys(APP_TYPES).length
  })
})

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Classify app type using AI
 */
async function classifyWithAI(description) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: `Classify this app description into ONE of these categories:
- booking (appointments, scheduling, reservations)
- directory (listings, search, catalog)
- waitlist (launch pages, signups, coming soon)
- portfolio (showcase, gallery, projects)
- store (ecommerce, products, selling)
- event (registration, RSVP, tickets)
- membership (community, courses, subscriptions)
- internal (team tools, trackers, dashboards)

Description: "${description}"

Respond with ONLY the category name (one word, lowercase). If unclear, respond "unknown".`
    }]
  })

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
  
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-20250514',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: prompt
    }]
  })

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
  const basePrompt = `You are an expert full-stack developer. Generate a complete, production-ready web application.

TECH STACK:
- Frontend: React 18 with Vite
- Styling: Tailwind CSS
- Backend: Express.js API routes (can be in same project)
- Database: Supabase (PostgreSQL)
- Auth: Supabase Auth (if needed)
- Payments: Stripe (if needed)

APP SPECIFICATION:
${JSON.stringify(spec, null, 2)}

REQUIREMENTS:
1. Generate ALL necessary files
2. Use modern React patterns (hooks, functional components)
3. Make it mobile-responsive
4. Include proper error handling
5. Add loading states
6. Use a clean, modern design

OUTPUT FORMAT:
For each file, use this exact format:

--- FILE: path/to/file.jsx ---
\`\`\`jsx
// file contents here
\`\`\`

--- FILE: path/to/another.css ---
\`\`\`css
/* file contents here */
\`\`\`

Generate these files:
1. src/App.jsx - Main app component
2. src/index.css - Global styles (Tailwind imports)
3. src/components/*.jsx - Feature components
4. package.json - Dependencies
5. tailwind.config.js - Tailwind config
6. Database schema (as SQL comment in a schema.sql file)

Make it beautiful and functional. Users should be able to use it immediately.`

  // Add template-specific instructions
  const templateInstructions = getTemplateInstructions(spec.type, spec)
  
  return basePrompt + '\n\n' + templateInstructions
}

/**
 * Get template-specific generation instructions
 */
function getTemplateInstructions(type, spec) {
  const instructions = {
    booking: `
BOOKING APP SPECIFIC:
- Create a service selection page
- Add a calendar/date picker for appointments
- Include a booking confirmation flow
- Show business info and services: ${spec.services || 'List services here'}
- Business name: ${spec.businessName || 'My Business'}
- Payment: ${spec.payments || 'Pay at appointment'}
- Client accounts: ${spec.clientAccounts || 'Guest booking'}
`,
    waitlist: `
WAITLIST APP SPECIFIC:
- Hero section with product name and tagline
- Email capture form (centered, prominent)
- ${spec.referrals?.includes('Yes') ? 'Add referral system with unique codes and leaderboard' : 'Simple signup without referrals'}
- ${spec.launchDate?.includes('Yes') ? 'Add countdown timer to launch' : 'Show "Coming Soon" without specific date'}
- Product name: ${spec.productName || 'Our Product'}
- Tagline: ${spec.tagline || 'Something amazing is coming'}
`,
    portfolio: `
PORTFOLIO APP SPECIFIC:
- Hero section with name and profession
- Project gallery with ${spec.projectTypes || 'visual'} display
- About section
- Contact: ${spec.contact || 'Contact form'}
- Name: ${spec.name || 'Your Name'}
- Profession: ${spec.profession || 'Creative Professional'}
`,
    store: `
STORE APP SPECIFIC:
- Product grid with images and prices
- Shopping cart functionality
- Checkout flow with Stripe
- Order confirmation
`,
    event: `
EVENT APP SPECIFIC:
- Event details hero section
- Registration form
- Ticket type selection (if applicable)
- Confirmation and email
`,
    directory: `
DIRECTORY APP SPECIFIC:
- Search bar (prominent)
- Listing cards
- Filter sidebar
- Detail view modal
`,
    membership: `
MEMBERSHIP APP SPECIFIC:
- Public landing page
- Login/signup flow
- Protected member area
- Subscription tiers
`,
    internal: `
INTERNAL TOOL SPECIFIC:
- Dashboard with key metrics
- Data table/list
- Add/edit forms
- Simple auth
`
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
