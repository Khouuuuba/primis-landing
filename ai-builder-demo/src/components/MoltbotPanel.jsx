import { useState, useEffect } from 'react'
import './MoltbotPanel.css'
import SkillsManager from './SkillsManager'
import DeploymentProgress from './DeploymentProgress'

const STEPS = ['name', 'provider', 'channels', 'payment', 'deploy']

const PROVIDERS = {
  anthropic: {
    id: 'anthropic',
    name: 'Claude',
    company: 'Anthropic',
    description: 'Best for coding, analysis, and complex tasks',
    recommended: true
  },
  openai: {
    id: 'openai',
    name: 'ChatGPT',
    company: 'OpenAI',
    description: 'Great for general conversation and creativity',
    recommended: false
  }
}

// Note: API keys are provided by Primis - users don't need their own

const CHANNELS = {
  telegram: {
    id: 'telegram',
    name: 'Telegram',
    description: 'Message your bot on Telegram',
    available: true,
    tokenPlaceholder: '123456789:ABCdefGHI...',
    docsUrl: 'https://t.me/BotFather',
    setupSteps: [
      'Open Telegram and message @BotFather',
      'Send /newbot and follow the prompts',
      'Copy the token that looks like 123456789:ABC...'
    ]
  },
  discord: {
    id: 'discord',
    name: 'Discord',
    description: 'Add your bot to Discord servers',
    available: true,
    tokenPlaceholder: 'MTIzNDU2Nzg5...',
    docsUrl: 'https://discord.com/developers/applications',
    setupSteps: [
      'Go to Discord Developer Portal',
      'Create a new application',
      'Go to Bot → Add Bot → Copy Token',
      'Enable "Message Content Intent"'
    ]
  },
  whatsapp: {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Coming soon',
    available: false
  },
  slack: {
    id: 'slack',
    name: 'Slack',
    description: 'Coming soon',
    available: false
  }
}

function MoltbotPanel({ user, showToast }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState({
    aiProvider: '',
    channels: {},
    instanceName: ''
  })
  const [errors, setErrors] = useState({})
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployedInstance, setDeployedInstance] = useState(null)
  const [showHelp, setShowHelp] = useState(null)
  const [instances, setInstances] = useState([])
  const [loadingInstances, setLoadingInstances] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [skillsInstance, setSkillsInstance] = useState(null) // Instance to manage skills for
  const [deletingInstanceId, setDeletingInstanceId] = useState(null)
  const [restartingInstanceId, setRestartingInstanceId] = useState(null)
  const [usage, setUsage] = useState(null) // { used, limit, bonus, remaining, total }
  const [showBuyModal, setShowBuyModal] = useState(false)
  const [messagePacks, setMessagePacks] = useState([])
  const [buyingPackId, setBuyingPackId] = useState(null)

  // Fetch existing instances with polling for active deployments
  useEffect(() => {
    const fetchInstances = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/moltbot/instances`,
          { headers: { 'x-privy-id': user?.id } }
        )
        if (response.ok) {
          const data = await response.json()
          setInstances(data.instances || [])
          return data.instances || []
        }
      } catch (err) {
        console.error('Failed to fetch instances:', err)
      } finally {
        setLoadingInstances(false)
      }
      return []
    }
    
    if (!user?.id) return

    // Initial fetch
    fetchInstances()

    // Polling for instances that are still deploying/building
    const POLLING_STATES = ['pending', 'deploying', 'building']
    let pollInterval = null

    const startPolling = () => {
      if (pollInterval) return
      
      pollInterval = setInterval(async () => {
        const updatedInstances = await fetchInstances()
        
        // Check if any instances still need polling
        const needsPolling = updatedInstances.some(
          instance => POLLING_STATES.includes(instance.status)
        )
        
        if (!needsPolling && pollInterval) {
          clearInterval(pollInterval)
          pollInterval = null
        }
      }, 5000) // Poll every 5 seconds
    }

    // Start polling if there are instances being deployed
    const checkAndPoll = async () => {
      const currentInstances = await fetchInstances()
      const needsPolling = currentInstances.some(
        instance => POLLING_STATES.includes(instance.status)
      )
      if (needsPolling) {
        startPolling()
      }
    }
    
    checkAndPoll()

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval)
      }
    }
  }, [user?.id])

  // Fetch message usage for the current billing period
  useEffect(() => {
    if (!user?.id) return
    const fetchUsage = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/chat/usage`,
          { headers: { 'x-privy-id': user?.id } }
        )
        if (response.ok) {
          const data = await response.json()
          setUsage(data)
        }
      } catch (err) {
        console.error('Failed to fetch usage:', err)
      }
    }
    fetchUsage()
  }, [user?.id])

  // Handle ?messages=success redirect from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const msgStatus = params.get('messages')
    const sessionId = params.get('session_id')
    
    if (msgStatus === 'success' && sessionId) {
      // Verify the purchase and refresh usage
      (async () => {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/payments/verify-messages`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-privy-id': user?.id },
              body: JSON.stringify({ sessionId })
            }
          )
          if (response.ok) {
            const data = await response.json()
            if (data.success) {
              showToast?.(`${data.messagesAdded} messages added! You now have ${data.remaining} remaining.`, 'success')
              // Refresh usage
              const usageRes = await fetch(
                `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/chat/usage`,
                { headers: { 'x-privy-id': user?.id } }
              )
              if (usageRes.ok) setUsage(await usageRes.json())
            }
          }
        } catch (err) {
          console.error('Message verification failed:', err)
        }
      })()
      window.history.replaceState({}, '', window.location.pathname + '?tab=moltbot')
    } else if (msgStatus === 'cancelled') {
      showToast?.('Message purchase cancelled', 'info')
      window.history.replaceState({}, '', window.location.pathname + '?tab=moltbot')
    }
  }, [])

  const openBuyModal = async () => {
    setShowBuyModal(true)
    if (messagePacks.length === 0) {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/payments/message-packs`
        )
        if (response.ok) {
          const data = await response.json()
          setMessagePacks(data.packs || [])
        }
      } catch (err) {
        console.error('Failed to fetch message packs:', err)
      }
    }
  }

  const handleBuyPack = async (packId) => {
    setBuyingPackId(packId)
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/payments/buy-messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-privy-id': user?.id },
          body: JSON.stringify({ packId })
        }
      )
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Failed to create checkout')
      }
    } catch (err) {
      showToast?.(err.message || 'Purchase failed', 'error')
    } finally {
      setBuyingPackId(null)
    }
  }

  const validateStep = (step) => {
    const newErrors = {}

    // Step 0: Name
    if (step === 0) {
      if (!formData.instanceName || formData.instanceName.trim().length < 3) {
        newErrors.instanceName = 'Name must be at least 3 characters'
      }
    }

    // Step 1: AI Provider
    if (step === 1) {
      if (!formData.aiProvider) {
        newErrors.aiProvider = 'Please select an AI provider'
      }
    }

    // Step 2: Channels
    if (step === 2) {
      const enabledChannels = Object.entries(formData.channels).filter(([_, v]) => v.enabled)
      if (enabledChannels.length === 0) {
        newErrors.channels = 'Please enable at least one channel'
      }
      enabledChannels.forEach(([channelId, config]) => {
        if (!config.token) {
          newErrors[`${channelId}_token`] = `${CHANNELS[channelId].name} token is required`
        }
      })
    }

    // Step 3: Payment (handled by Stripe redirect)
    // Step 4: Deploy (validated by handleDeploy)

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1))
    }
  }

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0))
  }

  const handleProviderSelect = (providerId) => {
    setFormData(prev => ({
      ...prev,
      aiProvider: providerId
    }))
    setErrors(prev => ({ ...prev, aiProvider: null }))
  }

  const handleChannelToggle = (channelId) => {
    setFormData(prev => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channelId]: {
          ...prev.channels[channelId],
          enabled: !prev.channels[channelId]?.enabled,
          token: prev.channels[channelId]?.token || ''
        }
      }
    }))
    setErrors(prev => ({ ...prev, channels: null, [`${channelId}_token`]: null }))
  }

  const handleChannelTokenChange = (channelId, token) => {
    setFormData(prev => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channelId]: {
          ...prev.channels[channelId],
          token
        }
      }
    }))
    setErrors(prev => ({ ...prev, [`${channelId}_token`]: null }))
  }

  const handleDeploy = async () => {
    // Name was validated at step 0, just check it's still there
    if (!formData.instanceName || formData.instanceName.trim().length < 3) {
      setErrors({ instanceName: 'Name must be at least 3 characters' })
      return
    }

    setIsDeploying(true)
    setErrors({})

    try {
      const channelsPayload = {}
      Object.entries(formData.channels).forEach(([id, config]) => {
        if (config.enabled && config.token) {
          channelsPayload[id] = { botToken: config.token }
        }
      })

      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/moltbot/deploy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-privy-id': user?.id
          },
          body: JSON.stringify({
            name: formData.instanceName,
            aiProvider: formData.aiProvider,
            channels: channelsPayload
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Deployment failed')
      }

      setDeployedInstance(data.instance)
      showToast?.('OpenClaw deployment started!', 'success')
      
      // Add to instances list
      setInstances(prev => [data.instance, ...prev])

    } catch (err) {
      setErrors({ deploy: err.message })
      showToast?.(err.message, 'error')
    } finally {
      setIsDeploying(false)
    }
  }

  const resetWizard = () => {
    setCurrentStep(0)
    setFormData({
      aiProvider: '',
      channels: {},
      instanceName: ''
    })
    setErrors({})
    setDeployedInstance(null)
  }

  // Payment state
  const [isPaid, setIsPaid] = useState(false)
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return renderNameStep()
      case 1:
        return renderProviderStep()
      case 2:
        return renderChannelsStep()
      case 3:
        return renderPaymentStep()
      case 4:
        return renderDeployStep()
      default:
        return null
    }
  }

  // Step 1: Name Your Agent
  const renderNameStep = () => (
    <div className="wizard-step">
      <h3 className="step-title">Name Your Agent</h3>
      <p className="step-description">
        Give your AI assistant a name. This will be its identity across all channels.
      </p>

      <div className="name-section">
        <label className="input-label">Agent Name</label>
        <input
          type="text"
          className={`name-input ${errors.instanceName ? 'error' : ''}`}
          placeholder="e.g. My Sales Bot"
          value={formData.instanceName}
          onChange={(e) => {
            setFormData(prev => ({ ...prev, instanceName: e.target.value }))
            setErrors(prev => ({ ...prev, instanceName: null }))
          }}
        />
        {errors.instanceName && (
          <p className="error-text">{errors.instanceName}</p>
        )}
      </div>
    </div>
  )

  // Step 2: AI Provider Selection
  const renderProviderStep = () => (
    <div className="wizard-step">
      <h3 className="step-title">Choose Your Brain</h3>
      <p className="step-description">
        Pick the AI that will power your assistant.
      </p>

      <div className="provider-grid">
        {Object.values(PROVIDERS).map(provider => (
          <button
            key={provider.id}
            className={`provider-card ${formData.aiProvider === provider.id ? 'selected' : ''}`}
            onClick={() => handleProviderSelect(provider.id)}
          >
            {provider.recommended && (
              <span className="recommended-badge">Recommended</span>
            )}
            <div className="provider-icon">
              {provider.id === 'anthropic' ? (
                <svg viewBox="0 0 24 24" fill="#D97757">
                  <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.677l5.815 3.354-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
                </svg>
              )}
            </div>
            <h4 className="provider-name">{provider.name}</h4>
            <p className="provider-company">{provider.company}</p>
            <p className="provider-desc">{provider.description}</p>
          </button>
        ))}
      </div>

      {errors.aiProvider && (
        <p className="error-text">{errors.aiProvider}</p>
      )}

      {formData.aiProvider && (
        <div className="api-included-notice">
          <div className="notice-icon">✨</div>
          <div className="notice-content">
            <strong>AI Included</strong>
            <p>Your $30/mo subscription includes 200 {PROVIDERS[formData.aiProvider].name} Opus messages. No API key needed!</p>
          </div>
        </div>
      )}
    </div>
  )

  // Step 2: Channel Selection
  const renderChannelsStep = () => (
    <div className="wizard-step">
      <h3 className="step-title">Connect Chat Channels</h3>
      <p className="step-description">
        Choose where your assistant will live. Enable at least one channel.
      </p>

      <div className="channels-grid">
        {Object.values(CHANNELS).map(channel => (
          <div
            key={channel.id}
            className={`channel-card ${!channel.available ? 'disabled' : ''} ${formData.channels[channel.id]?.enabled ? 'selected' : ''}`}
          >
            <div className="channel-header">
              <div className="channel-icon">
                {channel.id === 'telegram' && (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                  </svg>
                )}
                {channel.id === 'discord' && (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                )}
                {channel.id === 'whatsapp' && (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                )}
                {channel.id === 'slack' && (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                  </svg>
                )}
              </div>
              <div className="channel-info">
                <h4 className="channel-name">{channel.name}</h4>
                <p className="channel-desc">{channel.description}</p>
              </div>
              {channel.available ? (
                <button
                  className={`channel-toggle ${formData.channels[channel.id]?.enabled ? 'enabled' : ''}`}
                  onClick={() => handleChannelToggle(channel.id)}
                >
                  {formData.channels[channel.id]?.enabled ? 'Enabled' : 'Enable'}
                </button>
              ) : (
                <span className="coming-soon-badge">Soon</span>
              )}
            </div>

            {channel.available && formData.channels[channel.id]?.enabled && (
              <div className="channel-config">
                <label className="input-label">Bot Token</label>
                <div className="input-with-help">
                  <input
                    type="password"
                    className={`token-input ${errors[`${channel.id}_token`] ? 'error' : ''}`}
                    placeholder={channel.tokenPlaceholder}
                    value={formData.channels[channel.id]?.token || ''}
                    onChange={(e) => handleChannelTokenChange(channel.id, e.target.value)}
                  />
                  <button
                    className="help-btn"
                    onClick={() => setShowHelp(channel.id)}
                  >
                    How to get token
                  </button>
                </div>
                {errors[`${channel.id}_token`] && (
                  <p className="error-text">{errors[`${channel.id}_token`]}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {errors.channels && (
        <p className="error-text center">{errors.channels}</p>
      )}

      {/* Help Modal */}
      {showHelp && CHANNELS[showHelp] && (
        <div className="help-modal-overlay" onClick={() => setShowHelp(null)}>
          <div className="help-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowHelp(null)}>×</button>
            <h3>Get {CHANNELS[showHelp].name} Token</h3>
            <ol className="setup-steps">
              {CHANNELS[showHelp].setupSteps?.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
            <a
              href={CHANNELS[showHelp].docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="modal-link"
            >
              Open {CHANNELS[showHelp].name} →
            </a>
          </div>
        </div>
      )}
    </div>
  )

  // Delete instance handler
  const handleDeleteInstance = async (instanceId, instanceName) => {
    if (!confirm(`Are you sure you want to delete "${instanceName}"? This action cannot be undone.`)) {
      return
    }

    setDeletingInstanceId(instanceId)
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/moltbot/instances/${instanceId}`,
        {
          method: 'DELETE',
          headers: { 'x-privy-id': user?.id }
        }
      )

      if (response.ok) {
        setInstances(prev => prev.filter(i => i.id !== instanceId))
        showToast?.('Agent deleted successfully', 'success')
      } else {
        const data = await response.json()
        showToast?.(data.error || 'Failed to delete agent', 'error')
      }
    } catch (error) {
      console.error('Delete error:', error)
      showToast?.('Failed to delete agent', 'error')
    } finally {
      setDeletingInstanceId(null)
    }
  }

  // Restart instance handler (redeploy with updated skills)
  const handleRestartInstance = async (instanceId, instanceName) => {
    if (!confirm(`Restart "${instanceName}"? This will apply any skill changes and take 2-3 minutes.`)) {
      return
    }

    setRestartingInstanceId(instanceId)
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/moltbot/instances/${instanceId}/restart`,
        {
          method: 'POST',
          headers: { 'x-privy-id': user?.id }
        }
      )

      if (response.ok) {
        setInstances(prev => prev.map(i => 
          i.id === instanceId ? { ...i, status: 'deploying' } : i
        ))
        showToast?.('Restart initiated. Your bot will be back online in 2-3 minutes.', 'success')
      } else {
        const data = await response.json()
        showToast?.(data.error || 'Failed to restart agent', 'error')
      }
    } catch (error) {
      console.error('Restart error:', error)
      showToast?.('Failed to restart agent', 'error')
    } finally {
      setRestartingInstanceId(null)
    }
  }

  // Step 3: Payment
  const handlePayment = async () => {
    setIsProcessingPayment(true)
    
    try {
      // Create Stripe checkout session for OpenClaw subscription
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/payments/openclaw-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-privy-id': user?.id
          },
          body: JSON.stringify({
            aiProvider: formData.aiProvider,
            channels: Object.keys(formData.channels).filter(c => formData.channels[c]?.enabled),
            instanceName: formData.instanceName || 'my-openclaw'
          })
        }
      )

      const data = await response.json()

      if (data.url) {
        // Store form data in sessionStorage for after payment
        sessionStorage.setItem('openclawFormData', JSON.stringify(formData))
        // Redirect to Stripe checkout
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Failed to create checkout session')
      }
    } catch (err) {
      console.error('Payment error:', err)
      setErrors({ payment: err.message || 'Payment failed. Please try again.' })
      showToast?.('Payment failed. Please try again.', 'error')
    } finally {
      setIsProcessingPayment(false)
    }
  }

  // Check for payment success on mount (after Stripe redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const openclawStatus = params.get('openclaw')
    
    if (openclawStatus === 'success') {
      // Restore form data and proceed to deploy
      const savedFormData = sessionStorage.getItem('openclawFormData')
      if (savedFormData) {
        setFormData(JSON.parse(savedFormData))
        sessionStorage.removeItem('openclawFormData')
      }
      setIsPaid(true)
      setShowWizard(true)
      setCurrentStep(4) // Go to deploy step
      showToast?.('Payment successful! Ready to deploy.', 'success')
      
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname)
    } else if (openclawStatus === 'cancelled') {
      showToast?.('Payment cancelled', 'info')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const renderPaymentStep = () => {
    const enabledChannels = Object.entries(formData.channels)
      .filter(([_, v]) => v.enabled)
      .map(([id]) => CHANNELS[id]?.name)

    return (
      <div className="wizard-step">
        <h3 className="step-title">Complete Your Subscription</h3>
        <p className="step-description">
          Review your agent and subscribe to deploy.
        </p>

        <div className="payment-summary">
          <div className="summary-section">
            <h4>Your Agent</h4>
            <div className="summary-item">
              <span className="summary-label">Name</span>
              <span className="summary-value">{formData.instanceName}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">AI Model</span>
              <span className="summary-value">{PROVIDERS[formData.aiProvider]?.name} (Opus)</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Channels</span>
              <span className="summary-value">{enabledChannels.join(', ')}</span>
            </div>
          </div>

          <div className="pricing-section">
            <div className="price-row">
              <span>Primis Pro — AI Agent Hosting</span>
              <span className="price">$30/mo</span>
            </div>
            <div className="price-divider"></div>
            <div className="price-row total">
              <span>Total</span>
              <span className="price">$30/mo</span>
            </div>
          </div>

          <div className="payment-features">
            <div className="feature-item">✓ Claude Opus — most powerful AI model</div>
            <div className="feature-item">✓ 200 messages/month included</div>
            <div className="feature-item">✓ 24/7 managed hosting on Railway</div>
            <div className="feature-item">✓ Buy more messages anytime</div>
            <div className="feature-item">✓ Cancel anytime</div>
          </div>

          <button 
            className="payment-btn"
            onClick={handlePayment}
            disabled={isProcessingPayment}
          >
            {isProcessingPayment ? (
              <>
                <span className="spinner"></span>
                Processing...
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                  <line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
                Subscribe & Deploy — $30/mo
              </>
            )}
          </button>

          <p className="payment-note">
            Secure payment via Stripe. You'll receive a confirmation email to manage your subscription.
          </p>

          {errors.payment && (
            <p className="error-text center">{errors.payment}</p>
          )}
        </div>
      </div>
    )
  }

  // Step 5: Deploy (after payment)
  const renderDeployStep = () => {
    // Find the deploying instance from our list (it gets updated via polling)
    const deployingInstance = deployedInstance 
      ? instances.find(i => i.id === deployedInstance.id) || deployedInstance
      : null

    if (deployingInstance) {
      const isComplete = deployingInstance.status === 'running'
      
      return (
        <div className="wizard-step deploy-progress-step">
          <DeploymentProgress 
            instance={deployingInstance}
            onRefresh={() => {/* Polling handles this */}}
          />
          
          {isComplete && (
            <div className="deploy-actions">
              <button className="primary-btn" onClick={resetWizard}>
                Deploy Another Bot
              </button>
            </div>
          )}
        </div>
      )
    }

    const enabledChannels = Object.entries(formData.channels)
      .filter(([_, v]) => v.enabled)
      .map(([id]) => CHANNELS[id]?.name)

    return (
      <div className="wizard-step">
        <h3 className="step-title">Ready to Deploy!</h3>
        <p className="step-description">
          Payment confirmed. Your agent is ready to launch.
        </p>

        <div className="payment-confirmed">
          <div className="confirmed-badge">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
            Payment Confirmed
          </div>
        </div>

        <div className="review-section compact">
          <div className="review-item">
            <span className="review-label">Agent</span>
            <span className="review-value">{formData.instanceName}</span>
          </div>
          <div className="review-item">
            <span className="review-label">AI</span>
            <span className="review-value">{PROVIDERS[formData.aiProvider]?.name} (Opus)</span>
          </div>
          <div className="review-item">
            <span className="review-label">Channels</span>
            <span className="review-value">{enabledChannels.join(', ')}</span>
          </div>
          <div className="review-item">
            <span className="review-label">Messages</span>
            <span className="review-value">200/month included</span>
          </div>
        </div>

        {errors.deploy && (
          <p className="error-text center">{errors.deploy}</p>
        )}
      </div>
    )
  }

  // Render existing instances
  const renderInstances = () => {
    if (loadingInstances) {
      return <div className="loading-instances">Loading instances...</div>
    }

    if (instances.length === 0) return null

    return (
      <div className="existing-instances">
        <h3>Your Assistants</h3>

        {/* Usage indicator */}
        {usage && (
          <div className="usage-indicator">
            <div className="usage-header">
              <span className="usage-label">Messages this month</span>
              <span className="usage-count">{usage.used} / {usage.total}</span>
            </div>
            <div className="usage-bar">
              <div 
                className={`usage-fill ${usage.remaining <= 20 ? 'low' : ''} ${usage.remaining <= 0 ? 'empty' : ''}`} 
                style={{ width: `${Math.min(100, (usage.used / usage.total) * 100)}%` }}
              />
            </div>
            {usage.remaining <= 0 && (
              <div className="usage-limit-msg">
                <span>⚠️ Message limit reached</span>
                <button className="buy-more-link" onClick={openBuyModal}>
                  Buy more messages →
                </button>
              </div>
            )}
            {usage.remaining > 0 && usage.remaining <= 20 && (
              <p className="usage-warning">⚡ {usage.remaining} messages remaining</p>
            )}
          </div>
        )}

        <div className="instances-list">
          {instances.map(instance => (
            <div key={instance.id} className={`instance-item ${instance.status}`}>
              <div className="instance-header">
                <span className="instance-name">{instance.name}</span>
                <span className={`status-badge ${instance.status}`}>
                  {instance.status}
                </span>
              </div>
              <div className="instance-meta">
                <span>{PROVIDERS[instance.aiProvider]?.name}</span>
                <span>{instance.channels?.join(', ')}</span>
              </div>
              <div className="instance-actions">
                {instance.status === 'running' && (
                  <>
                    <button 
                      className="action-btn primary"
                      onClick={() => setSkillsInstance(instance)}
                    >
                      Skills
                    </button>
                    <button 
                      className="action-btn secondary"
                      onClick={() => handleRestartInstance(instance.id, instance.name)}
                      disabled={restartingInstanceId === instance.id}
                    >
                      {restartingInstanceId === instance.id ? 'Restarting...' : 'Restart'}
                    </button>
                    {usage && usage.remaining <= 20 && (
                      <button 
                        className="action-btn accent"
                        onClick={openBuyModal}
                      >
                        Buy Messages
                      </button>
                    )}
                  </>
                )}
                <button 
                  className="action-btn danger"
                  onClick={() => handleDeleteInstance(instance.id, instance.name)}
                  disabled={deletingInstanceId === instance.id}
                >
                  {deletingInstanceId === instance.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Check if user has any active (non-failed) instances
  const hasActiveInstances = instances.some(i => 
    ['running', 'building', 'deploying', 'pending'].includes(i.status)
  )

  // Show loading state while fetching instances
  if (loadingInstances) {
    return (
      <div className="moltbot-panel">
        <div className="openclaw-loading">
          <div className="loading-spinner"></div>
          <p>Loading your bots...</p>
        </div>
      </div>
    )
  }

  // Intro page - show unless user clicked "Deploy" or has active instances
  if (!showWizard && !deployedInstance && !hasActiveInstances) {
    return (
      <div className="moltbot-panel">
        <div className="openclaw-intro">
          {/* Hero Section */}
          <div className="intro-hero">
            <div className="hero-badge">162k+ ⭐ on GitHub</div>
            <h1 className="hero-title">Your Personal AI That Never Sleeps</h1>
            <p className="hero-subtitle">
              Deploy your own AI assistant that lives in Telegram, Discord, and more. 
              It codes, creates, browses the web, and automates tasks — all from chat.
            </p>
            <button className="deploy-cta" onClick={() => setShowWizard(true)}>
              🚀 Deploy Your Own
            </button>
          </div>

          {/* Features Grid */}
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">💬</div>
              <h3>Multi-Platform</h3>
              <p>Telegram, Discord, Slack, WhatsApp, and more</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">💻</div>
              <h3>Run Code</h3>
              <p>Execute commands and automate workflows</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📁</div>
              <h3>File Access</h3>
              <p>Read, write, and manage your files</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🌐</div>
              <h3>Web Browsing</h3>
              <p>Search and fetch information from anywhere</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🖼️</div>
              <h3>Image Generation</h3>
              <p>Create visuals with AI image models</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔌</div>
              <h3>Plugin Ecosystem</h3>
              <p>Extend with custom tools and integrations</p>
            </div>
          </div>

          {/* Demo Preview - Telegram Style */}
          <div className="demo-preview">
            <div className="telegram-window">
              <div className="telegram-header">
                <button className="tg-back">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6"/>
                  </svg>
                </button>
                <div className="tg-avatar">🦞</div>
                <div className="tg-info">
                  <span className="tg-name">OpenClaw</span>
                  <span className="tg-status">online</span>
                </div>
                <div className="tg-actions">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2"/>
                    <circle cx="12" cy="12" r="2"/>
                    <circle cx="12" cy="19" r="2"/>
                  </svg>
                </div>
              </div>
              <div className="telegram-chat">
                <div className="tg-message user">
                  <div className="tg-bubble">Can you analyze sales.csv and tell me the top 3 products?</div>
                  <span className="tg-time">10:42</span>
                </div>
                <div className="tg-message bot">
                  <div className="tg-bubble">
                    📊 Analyzing your sales data...
                  </div>
                  <span className="tg-time">10:42</span>
                </div>
                <div className="tg-message bot">
                  <div className="tg-bubble code-block">
                    <span className="code-label">📁 sales_analysis.py</span>
                    <code>import pandas as pd{'\n'}df = pd.read_csv('sales.csv'){'\n'}top_3 = df.groupby('product')['revenue'].sum().nlargest(3)</code>
                  </div>
                  <span className="tg-time">10:42</span>
                </div>
                <div className="tg-message bot">
                  <div className="tg-bubble">
                    <strong>✅ Top 3 Products by Revenue:</strong><br/>
                    1. Premium Widget — $48,200<br/>
                    2. Pro Bundle — $35,800<br/>
                    3. Starter Kit — $22,450
                  </div>
                  <span className="tg-time">10:43</span>
                </div>
                <div className="tg-message user">
                  <div className="tg-bubble">Perfect! Save this to a report file</div>
                  <span className="tg-time">10:43</span>
                </div>
                <div className="tg-message bot">
                  <div className="tg-bubble">
                    ✅ Done! Saved to <code>report.md</code>
                  </div>
                  <span className="tg-time">10:43</span>
                </div>
              </div>
              <div className="telegram-input">
                <svg className="tg-attach" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
                <input type="text" placeholder="Message" disabled />
                <svg className="tg-mic" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              </div>
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="intro-footer">
            <p className="footer-note">Powered by Claude Opus • $30/mo • 200 messages included</p>
            <button className="deploy-cta secondary" onClick={() => setShowWizard(true)}>
              Get Started →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="moltbot-panel">
      <div className="panel-header">
        <div className="header-content">
          <h1>Deploy OpenClaw</h1>
          {!showWizard && <button className="back-to-intro" onClick={() => setShowWizard(false)}>← Back</button>}
        </div>
        <p className="header-desc">
          Set up your personal AI assistant in minutes.
        </p>
      </div>

      {/* Progress Steps */}
      <div className="wizard-progress">
        {STEPS.map((step, index) => (
          <div
            key={step}
            className={`progress-step ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
          >
            <div className="step-indicator">
              {index < currentStep ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              ) : (
                <span>{index + 1}</span>
              )}
            </div>
            <span className="step-label">
              {step === 'name' && 'Name'}
              {step === 'provider' && 'AI'}
              {step === 'channels' && 'Channels'}
              {step === 'payment' && 'Payment'}
              {step === 'deploy' && 'Deploy'}
            </span>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="wizard-content">
        {renderStepContent()}
      </div>

      {/* Navigation */}
      {!deployedInstance && (
        <div className="wizard-nav">
          {currentStep > 0 && (
            <button className="back-btn" onClick={handleBack}>
              ← Back
            </button>
          )}
          <div className="nav-spacer" />
          {/* Steps 0-2 (Name, AI, Channels): show Continue */}
          {currentStep < 3 && (
            <button className="next-btn" onClick={handleNext}>
              Continue →
            </button>
          )}
          {/* Step 3 (Payment): has its own button in the content */}
          {/* Step 4 (Deploy): show Deploy button */}
          {currentStep === 4 && (
            <button
              className="deploy-btn"
              onClick={handleDeploy}
              disabled={isDeploying}
            >
              {isDeploying ? (
                <>
                  <span className="spinner" />
                  Deploying...
                </>
              ) : (
                '🚀 Deploy Agent'
              )}
            </button>
          )}
        </div>
      )}

      {/* Existing Instances */}
      {renderInstances()}

      {/* Skills Manager Modal */}
      {skillsInstance && (
        <div className="skills-modal-overlay" onClick={() => setSkillsInstance(null)}>
          <div className="skills-modal" onClick={(e) => e.stopPropagation()}>
            <SkillsManager
              instanceId={skillsInstance.id}
              user={user}
              showToast={showToast}
              onClose={() => setSkillsInstance(null)}
            />
          </div>
        </div>
      )}

      {/* Buy More Messages Modal */}
      {showBuyModal && (
        <div className="buy-modal-overlay" onClick={() => setShowBuyModal(false)}>
          <div className="buy-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowBuyModal(false)}>×</button>
            <h3 className="buy-modal-title">Buy More Messages</h3>
            <p className="buy-modal-desc">
              Add extra Claude Opus messages to your monthly allowance. 
              Bonus messages don't expire until used.
            </p>

            {usage && (
              <div className="buy-modal-usage">
                <span>Current: {usage.used}/{usage.total} used</span>
                <span>{usage.remaining} remaining</span>
              </div>
            )}

            <div className="packs-grid">
              {messagePacks.map(pack => (
                <div key={pack.id} className={`pack-card ${pack.popular ? 'popular' : ''}`}>
                  {pack.popular && <span className="pack-popular-badge">Best Value</span>}
                  <h4 className="pack-name">{pack.name}</h4>
                  <p className="pack-desc">{pack.description}</p>
                  <div className="pack-price">${pack.price}</div>
                  <button
                    className="pack-buy-btn"
                    onClick={() => handleBuyPack(pack.id)}
                    disabled={buyingPackId === pack.id}
                  >
                    {buyingPackId === pack.id ? 'Processing...' : 'Buy Now'}
                  </button>
                </div>
              ))}
              {messagePacks.length === 0 && (
                <div className="packs-loading">Loading packs...</div>
              )}
            </div>

            <p className="buy-modal-note">
              Secure payment via Stripe. Messages are added instantly after purchase.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default MoltbotPanel
