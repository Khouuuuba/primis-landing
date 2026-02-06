/**
 * Bob the Builder API
 * 
 * Handles communication with the backend for:
 * - AI classification and code generation
 * - App deployment
 * - Database persistence
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

/**
 * Classify app type from user description using AI
 */
export async function classifyAppType(description) {
  try {
    const response = await fetch(`${API_URL}/api/bob/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    })
    
    if (!response.ok) throw new Error('Classification failed')
    
    return await response.json()
  } catch (error) {
    console.error('Classification error:', error)
    // Fallback to local classification
    return localClassify(description)
  }
}

/**
 * Local keyword-based classification (fallback)
 */
function localClassify(text) {
  const lowerText = text.toLowerCase()
  
  const APP_TYPES = {
    booking: {
      keywords: ['appointment', 'book', 'schedule', 'calendar', 'reservation', 'booking', 'grooming', 'salon', 'spa', 'therapy', 'consult'],
      label: 'Booking & Scheduling',
      icon: '📅',
      description: 'Let clients book appointments with you'
    },
    directory: {
      keywords: ['directory', 'list', 'find', 'search', 'catalog', 'listings', 'database', 'lookup'],
      label: 'Directory & Listings',
      icon: '📋',
      description: 'Create a searchable directory'
    },
    waitlist: {
      keywords: ['waitlist', 'signup', 'launch', 'coming soon', 'early access', 'notify', 'beta', 'pre-launch'],
      label: 'Waitlist & Launch',
      icon: '🚀',
      description: 'Collect signups for your launch'
    },
    portfolio: {
      keywords: ['portfolio', 'showcase', 'gallery', 'work', 'projects', 'display', 'photography', 'design', 'art'],
      label: 'Portfolio & Showcase',
      icon: '🎨',
      description: 'Show off your work beautifully'
    },
    store: {
      keywords: ['sell', 'shop', 'store', 'products', 'buy', 'ecommerce', 'purchase', 'merchandise', 'goods'],
      label: 'Simple Store',
      icon: '🛒',
      description: 'Sell products online'
    },
    event: {
      keywords: ['event', 'registration', 'rsvp', 'workshop', 'conference', 'ticket', 'meetup', 'class', 'seminar'],
      label: 'Event Registration',
      icon: '🎟️',
      description: 'Manage event signups'
    },
    membership: {
      keywords: ['members', 'subscription', 'community', 'course', 'paywall', 'exclusive', 'premium', 'club'],
      label: 'Membership Site',
      icon: '👥',
      description: 'Build a members-only community'
    },
    internal: {
      keywords: ['team', 'internal', 'tracker', 'inventory', 'employee', 'dashboard', 'crm', 'admin'],
      label: 'Internal Tool',
      icon: '🔧',
      description: 'Team tools and trackers'
    }
  }
  
  for (const [type, config] of Object.entries(APP_TYPES)) {
    for (const keyword of config.keywords) {
      if (lowerText.includes(keyword)) {
        return {
          success: true,
          type,
          ...config
        }
      }
    }
  }
  
  return { success: false, type: null }
}

/**
 * Generate app code using AI
 * Includes automatic retry on rate limit (429) errors
 */
export async function generateAppCode(appSpec) {
  const maxRetries = 3
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${API_URL}/api/bob/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: appSpec })
      })
      
      if (response.status === 429) {
        // Rate limited - extract retry info and wait
        const data = await response.json().catch(() => ({}))
        const retryAfter = data.retryAfter || (15 * (attempt + 1)) // Default: 15s, 30s, 45s
        
        if (attempt < maxRetries) {
          console.warn(`Rate limited. Retrying in ${retryAfter}s (attempt ${attempt + 1}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
          continue
        }
        
        throw new Error('AI service is busy. Please wait a minute and try again.')
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Code generation failed')
      }
      
      return await response.json()
    } catch (error) {
      if (attempt >= maxRetries || !error.message?.includes('Rate') && !error.message?.includes('rate') && !error.message?.includes('429')) {
        console.error('Generation error:', error)
        throw error
      }
    }
  }
}

/**
 * Deploy generated app
 */
export async function deployApp(appId, userId) {
  try {
    const response = await fetch(`${API_URL}/api/bob/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, userId })
    })
    
    if (!response.ok) throw new Error('Deployment failed')
    
    return await response.json()
  } catch (error) {
    console.error('Deployment error:', error)
    throw error
  }
}

/**
 * Save conversation to database
 */
export async function saveConversation(userId, appId, messages, phase) {
  try {
    const response = await fetch(`${API_URL}/api/bob/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, appId, messages, phase })
    })
    
    if (!response.ok) throw new Error('Save failed')
    
    return await response.json()
  } catch (error) {
    console.error('Save error:', error)
    // Continue without saving - non-critical
    return null
  }
}

/**
 * Get user's apps
 */
export async function getUserApps(userId) {
  try {
    const response = await fetch(`${API_URL}/api/bob/apps?userId=${userId}`)
    
    if (!response.ok) throw new Error('Failed to fetch apps')
    
    return await response.json()
  } catch (error) {
    console.error('Fetch apps error:', error)
    return { apps: [] }
  }
}

export default {
  classifyAppType,
  generateAppCode,
  deployApp,
  saveConversation,
  getUserApps
}
