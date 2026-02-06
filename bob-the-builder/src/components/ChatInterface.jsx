import { useState, useRef, useEffect } from 'react'
import './ChatInterface.css'

// Conversation phases
const PHASES = {
  GREETING: 'greeting',
  CLASSIFICATION: 'classification',
  DISCOVERY: 'discovery',
  CONFIRMATION: 'confirmation',
  GENERATION: 'generation',
  COMPLETE: 'complete'
}

// App type keywords for classification
const APP_TYPES = {
  booking: {
    keywords: ['appointment', 'book', 'schedule', 'calendar', 'reservation', 'booking'],
    label: 'Booking & Scheduling',
    icon: '📅',
    description: 'Let clients book appointments with you'
  },
  directory: {
    keywords: ['directory', 'list', 'find', 'search', 'catalog', 'listings'],
    label: 'Directory & Listings',
    icon: '📋',
    description: 'Create a searchable directory'
  },
  waitlist: {
    keywords: ['waitlist', 'signup', 'launch', 'coming soon', 'early access', 'notify'],
    label: 'Waitlist & Launch',
    icon: '🚀',
    description: 'Collect signups for your launch'
  },
  portfolio: {
    keywords: ['portfolio', 'showcase', 'gallery', 'work', 'projects', 'display'],
    label: 'Portfolio & Showcase',
    icon: '🎨',
    description: 'Show off your work beautifully'
  },
  store: {
    keywords: ['sell', 'shop', 'store', 'products', 'buy', 'ecommerce', 'purchase'],
    label: 'Simple Store',
    icon: '🛒',
    description: 'Sell products online'
  },
  event: {
    keywords: ['event', 'registration', 'rsvp', 'workshop', 'conference', 'ticket'],
    label: 'Event Registration',
    icon: '🎟️',
    description: 'Manage event signups'
  },
  membership: {
    keywords: ['members', 'subscription', 'community', 'course', 'paywall', 'exclusive'],
    label: 'Membership Site',
    icon: '👥',
    description: 'Build a members-only community'
  },
  internal: {
    keywords: ['team', 'internal', 'tracker', 'inventory', 'employee', 'dashboard'],
    label: 'Internal Tool',
    icon: '🔧',
    description: 'Team tools and trackers'
  }
}

// Initial greeting message
const GREETING_MESSAGE = {
  role: 'assistant',
  content: `Hi! I'm Bob 🔨

I build apps for you — no coding needed.

**Tell me what you want to build** and I'll create it in minutes.

For example:
• "A booking system for my salon"
• "A portfolio to showcase my photography"
• "A waitlist page for my startup"

What would you like to build?`
}

function ChatInterface({ currentApp: externalApp, onAppCreated, onShowPreview }) {
  const [messages, setMessages] = useState([GREETING_MESSAGE])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [phase, setPhase] = useState(PHASES.GREETING)
  const [appSpec, setAppSpec] = useState({})
  const [detectedType, setDetectedType] = useState(null)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [currentApp, setCurrentApp] = useState(externalApp)
  
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Classify app type from user input
  const classifyAppType = (text) => {
    const lowerText = text.toLowerCase()
    
    for (const [type, config] of Object.entries(APP_TYPES)) {
      for (const keyword of config.keywords) {
        if (lowerText.includes(keyword)) {
          return { type, ...config }
        }
      }
    }
    
    return null
  }

  // Add assistant message with typing effect
  const addAssistantMessage = async (content, delay = 500) => {
    setIsTyping(true)
    await new Promise(resolve => setTimeout(resolve, delay))
    setIsTyping(false)
    
    setMessages(prev => [...prev, { role: 'assistant', content }])
  }

  // Handle user message
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isTyping) return

    const userMessage = inputValue.trim()
    setInputValue('')
    
    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])

    // Process based on current phase
    switch (phase) {
      case PHASES.GREETING:
        await handleGreetingPhase(userMessage)
        break
      case PHASES.CLASSIFICATION:
        await handleClassificationPhase(userMessage)
        break
      case PHASES.DISCOVERY:
        await handleDiscoveryPhase(userMessage)
        break
      case PHASES.CONFIRMATION:
        await handleConfirmationPhase(userMessage)
        break
      case PHASES.COMPLETE:
        await handleCompletePhase(userMessage)
        break
      default:
        break
    }
  }

  // Handle post-generation commands
  const handleCompletePhase = async (userMessage) => {
    const lower = userMessage.toLowerCase()
    
    if (lower.includes('show code') || lower.includes('see code') || lower.includes('view code') || lower.includes('preview')) {
      // Open the preview panel
      if (currentApp?.code?.files) {
        await addAssistantMessage(
          `📄 Opening the **Preview Panel**...\n\nYou can browse all ${currentApp.code.files.length} generated files and see the code!`
        )
        
        // Trigger the preview panel
        setTimeout(() => {
          onShowPreview?.()
        }, 500)
      } else {
        await addAssistantMessage(
          `Code preview is not available yet. The app structure has been created but full code generation requires the AI service to be configured.`
        )
      }
    } else if (lower.includes('deploy') || lower.includes('go live')) {
      await addAssistantMessage(
        `🚀 **Ready to deploy!**\n\nYour app will be live at:\n\`${currentApp?.name?.toLowerCase().replace(/\s+/g, '-') || 'your-app'}.primis.app\`\n\n**Pricing:**\n• $29/month - Includes hosting, SSL, and updates\n• Cancel anytime\n\nTo proceed, I'll need to set up your billing. Type "continue" to proceed.`
      )
    } else if (lower.includes('change') || lower.includes('edit') || lower.includes('modify')) {
      await addAssistantMessage(
        `Sure! What would you like to change?\n\nJust describe the change and I'll update your app. For example:\n• "Make the header blue"\n• "Add a contact form"\n• "Change the business hours"`
      )
      setPhase(PHASES.DISCOVERY) // Allow making changes
    } else {
      await addAssistantMessage(
        `Your app is ready! Here's what you can do:\n\n• Type **"show code"** to see the generated code\n• Type **"deploy"** to go live\n• Or describe any changes you'd like to make`
      )
    }
  }

  // Handle greeting phase - classify app type
  const handleGreetingPhase = async (userMessage) => {
    const detected = classifyAppType(userMessage)
    
    if (detected) {
      setDetectedType(detected)
      setAppSpec(prev => ({ ...prev, type: detected.type, userDescription: userMessage }))
      setPhase(PHASES.CLASSIFICATION)
      
      await addAssistantMessage(
        `${detected.icon} **${detected.label}** — great choice!\n\n${detected.description}.\n\nLet me ask a few questions to build this exactly how you need it.`
      )
      
      // Move to discovery
      setPhase(PHASES.DISCOVERY)
      await askDiscoveryQuestion(detected.type, 0)
    } else {
      await addAssistantMessage(
        `I'd love to help! Could you tell me more about what kind of app you need?\n\nFor example:\n• Booking appointments\n• Listing/directory\n• Event registration\n• Portfolio/showcase\n• Online store\n• Waitlist page`
      )
    }
  }

  // Handle explicit classification if needed
  const handleClassificationPhase = async (userMessage) => {
    const detected = classifyAppType(userMessage)
    
    if (detected) {
      setDetectedType(detected)
      setAppSpec(prev => ({ ...prev, type: detected.type }))
      setPhase(PHASES.DISCOVERY)
      
      await addAssistantMessage(`Got it! Building a ${detected.label.toLowerCase()}.`)
      await askDiscoveryQuestion(detected.type, 0)
    } else {
      await addAssistantMessage(
        `I'm not sure I understood. Which type of app sounds closest?\n\n• 📅 Booking & Scheduling\n• 📋 Directory & Listings\n• 🚀 Waitlist & Launch\n• 🎨 Portfolio & Showcase\n• 🛒 Simple Store\n• 🎟️ Event Registration`
      )
    }
  }

  // Discovery questions by app type
  const DISCOVERY_QUESTIONS = {
    booking: [
      {
        key: 'clientAccounts',
        question: `**1. Client Accounts**\n\nWill clients create accounts, or just book as guests?\n\n• **Accounts** — They can see history, reschedule\n• **Guest** — Simpler, less friction\n• **Both** — Let them choose`,
        options: ['Accounts', 'Guest only', 'Both options']
      },
      {
        key: 'calendar',
        question: `**2. Calendar**\n\nHow do you manage your schedule currently?\n\n• **Google Calendar** — I'll sync with it\n• **Other calendar** — I'll work with it\n• **No system yet** — I'll create one for you`,
        options: ['Google Calendar', 'Other calendar', 'No system yet']
      },
      {
        key: 'payments',
        question: `**3. Payments**\n\nShould clients pay when booking?\n\n• **Pay upfront** — Full payment to book\n• **Deposit only** — Partial payment to hold spot\n• **Pay later** — At the appointment\n• **Free** — No payment needed`,
        options: ['Pay upfront', 'Deposit only', 'Pay at appointment', 'Free / No payment']
      },
      {
        key: 'services',
        question: `**4. Services**\n\nWhat services do you offer? Just list them with prices.\n\nExample: "Haircut $30, Color $80, Full styling $120"`,
        options: null // Free text
      },
      {
        key: 'businessName',
        question: `**5. Business Name**\n\nWhat's your business called?\n\nThis will be the title of your booking page.`,
        options: null // Free text
      }
    ],
    waitlist: [
      {
        key: 'referrals',
        question: `**1. Referral System**\n\nDo you want a referral system? (People move up the waitlist by inviting friends)\n\n• **Yes** — Viral growth, gamified\n• **No** — Simple email signup`,
        options: ['Yes, add referrals', 'No, keep it simple']
      },
      {
        key: 'launchDate',
        question: `**2. Launch Date**\n\nDo you have a launch date to display?\n\n• **Yes** — I'll add a countdown\n• **No** — Just "Coming Soon"`,
        options: ['Yes, show countdown', 'No countdown needed']
      },
      {
        key: 'productName',
        question: `**3. Product Name**\n\nWhat's the name of your product or company?`,
        options: null
      },
      {
        key: 'tagline',
        question: `**4. Tagline**\n\nGive me a short tagline or description (1-2 sentences).`,
        options: null
      }
    ],
    portfolio: [
      {
        key: 'projectTypes',
        question: `**1. Work Type**\n\nWhat kind of work will you showcase?\n\n• **Visual** — Photos, designs, art\n• **Case studies** — Detailed project writeups\n• **Mixed** — Both visuals and descriptions`,
        options: ['Visual gallery', 'Case studies', 'Mixed']
      },
      {
        key: 'contact',
        question: `**2. Contact**\n\nHow should people reach you?\n\n• **Contact form** — I'll collect inquiries\n• **Direct email** — Show your email\n• **Both** — Form + email displayed`,
        options: ['Contact form', 'Direct email', 'Both']
      },
      {
        key: 'name',
        question: `**3. Your Name**\n\nWhat name should appear on your portfolio?`,
        options: null
      },
      {
        key: 'profession',
        question: `**4. Profession**\n\nWhat do you do? (e.g., "Photographer", "UI Designer", "Architect")`,
        options: null
      }
    ],
    // Add more app types as needed...
  }

  // Get questions for current app type
  const getQuestions = (type) => {
    return DISCOVERY_QUESTIONS[type] || DISCOVERY_QUESTIONS.booking
  }

  // Ask a discovery question
  const askDiscoveryQuestion = async (type, index) => {
    const questions = getQuestions(type)
    
    if (index >= questions.length) {
      // All questions answered, move to confirmation
      setPhase(PHASES.CONFIRMATION)
      await showConfirmation()
      return
    }
    
    const q = questions[index]
    setCurrentQuestion(index)
    
    let message = q.question
    if (q.options) {
      message += '\n\n' + q.options.map((opt, i) => `**${i + 1}.** ${opt}`).join('\n')
    }
    
    await addAssistantMessage(message)
  }

  // Handle discovery phase answers
  const handleDiscoveryPhase = async (userMessage) => {
    const questions = getQuestions(detectedType.type)
    const currentQ = questions[currentQuestion]
    
    // Save answer to appSpec
    setAppSpec(prev => ({
      ...prev,
      [currentQ.key]: userMessage
    }))
    
    // Move to next question
    const nextIndex = currentQuestion + 1
    await askDiscoveryQuestion(detectedType.type, nextIndex)
  }

  // Show confirmation of what will be built
  const showConfirmation = async () => {
    const summary = Object.entries(appSpec)
      .filter(([key]) => key !== 'type' && key !== 'userDescription')
      .map(([key, value]) => `• **${formatKey(key)}:** ${value}`)
      .join('\n')
    
    await addAssistantMessage(
      `Perfect! Here's what I'm going to build:\n\n**${detectedType.label}**\n\n${summary}\n\n---\n\nDoes this look right?\n\n**1.** Yes, build it!\n**2.** No, let me change something`
    )
  }

  // Format key for display
  const formatKey = (key) => {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim()
  }

  // Handle confirmation phase
  const handleConfirmationPhase = async (userMessage) => {
    const lower = userMessage.toLowerCase()
    
    if (lower.includes('yes') || lower.includes('build') || lower === '1') {
      setPhase(PHASES.GENERATION)
      await addAssistantMessage(
        `🔨 **Building your app...**\n\nThis takes about 30-60 seconds while I generate the code.`
      )
      
      // Build the app using AI
      await buildApp()
    } else {
      await addAssistantMessage(
        `No problem! What would you like to change?\n\nJust tell me what's different and I'll update it.`
      )
      setPhase(PHASES.DISCOVERY)
    }
  }

  // Build the app using AI
  const buildApp = async () => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
    
    // Show progress messages
    await addAssistantMessage('📝 Analyzing your requirements...', 800)
    await addAssistantMessage('🧠 Generating code with AI...', 1000)
    
    try {
      // Call the real API
      const response = await fetch(`${API_URL}/api/bob/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: { ...appSpec, type: detectedType.type } })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Generation failed')
      }
      
      const result = await response.json()
      
      await addAssistantMessage('✅ Code generated successfully!', 500)
      await addAssistantMessage('🎨 Preparing preview...', 800)
      
      // Complete
      setPhase(PHASES.COMPLETE)
      
      const appId = 'app-' + Date.now()
      const newApp = {
        id: appId,
        name: appSpec.businessName || appSpec.productName || appSpec.name || 'My App',
        type: detectedType.type,
        spec: appSpec,
        code: result.code,
        createdAt: new Date().toISOString(),
        status: 'preview'
      }
      
      // Show generated files summary
      const fileList = result.code?.files?.length 
        ? result.code.files.map(f => `• \`${f.path}\``).join('\n')
        : '• App files generated'
      
      await addAssistantMessage(
        `🎉 **Your app is ready!**\n\n**${newApp.name}**\n\n**Generated ${result.code?.files?.length || 'multiple'} files:**\n${fileList}\n\n---\n\n**What's next?**\n\n• Type **"preview"** to open the code viewer\n• Type **"deploy"** to go live ($29/month)\n• Or tell me what to change!`
      )
      
      // Auto-open preview panel
      setTimeout(() => {
        onShowPreview?.()
      }, 1000)
      
      setCurrentApp(newApp)
      onAppCreated?.(newApp)
      
    } catch (error) {
      console.error('Build error:', error)
      
      // Check if it's a rate limit error
      const isRateLimit = error.message?.includes('busy') || error.message?.includes('rate') || error.message?.includes('429') || error.message?.includes('Rate')
      
      if (isRateLimit) {
        await addAssistantMessage(
          `⏳ **The AI service is a bit busy right now.**\n\nThis happens during peak usage. Please wait about 60 seconds and try again.\n\nType **"build"** to retry when ready!`,
          500
        )
        setPhase(PHASES.CONFIRMATION) // Allow them to retry
      } else {
        // Fallback to simulated build if API fails for other reasons
        await addAssistantMessage(
          `⚠️ AI generation is not available right now.\n\n**Error:** ${error.message}\n\nI'll create a preview version for you to see the structure.`,
          500
        )
        
        // Simulated fallback
        await simulateBuildFallback()
      }
    }
  }

  // Fallback simulated build (when API is unavailable)
  const simulateBuildFallback = async () => {
    await addAssistantMessage('📝 Creating preview structure...', 1000)
    
    setPhase(PHASES.COMPLETE)
    
    const appId = 'app-' + Date.now()
    const newApp = {
      id: appId,
      name: appSpec.businessName || appSpec.productName || appSpec.name || 'My App',
      type: detectedType.type,
      spec: appSpec,
      createdAt: new Date().toISOString(),
      status: 'preview'
    }
    
    await addAssistantMessage(
      `🎉 **Preview ready!**\n\n**${newApp.name}**\n\nPreview: \`preview-${appId.slice(-6)}.bob.primis.app\`\n\n---\n\n**Note:** AI code generation requires \`ANTHROPIC_API_KEY\` to be configured.\n\nFor now, you can see the app structure and deploy when ready.`
    )
    
    setCurrentApp(newApp)
    onAppCreated?.(newApp)
  }

  // Handle key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Render a message
  const renderMessage = (message, index) => {
    const isUser = message.role === 'user'
    
    return (
      <div key={index} className={`message ${isUser ? 'user' : 'assistant'} animate-fade-in`}>
        {!isUser && (
          <div className="message-avatar">
            <span>🔨</span>
          </div>
        )}
        <div className="message-content">
          <div 
            className="message-text"
            dangerouslySetInnerHTML={{ 
              __html: formatMarkdown(message.content) 
            }}
          />
        </div>
        {isUser && (
          <div className="message-avatar user-avatar">
            <span>👤</span>
          </div>
        )}
      </div>
    )
  }

  // Simple markdown formatting
  const formatMarkdown = (text) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>')
      .replace(/• /g, '&bull; ')
  }

  return (
    <div className="chat-interface">
      <header className="chat-header">
        <div className="chat-title">
          <span className="bob-icon">🔨</span>
          <div>
            <h1>Bob the Builder</h1>
            <p className="chat-subtitle">You talk, I build</p>
          </div>
        </div>
        <div className="chat-status">
          <span className={`status-dot ${isTyping ? 'typing' : ''}`}></span>
          <span className="status-text">
            {isTyping ? 'Bob is typing...' : 'Online'}
          </span>
        </div>
      </header>

      <div className="chat-messages">
        {messages.map((msg, i) => renderMessage(msg, i))}
        
        {isTyping && (
          <div className="message assistant animate-fade-in">
            <div className="message-avatar">
              <span>🔨</span>
            </div>
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <div className="chat-input-wrapper">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Describe what you want to build..."
            rows={1}
            disabled={isTyping || phase === PHASES.GENERATION}
          />
          <button 
            className="send-button"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isTyping || phase === PHASES.GENERATION}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>
        <p className="chat-hint">
          Press Enter to send • Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

export default ChatInterface
