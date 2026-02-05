import { useState, useEffect } from 'react'
import './DeploymentProgress.css'

const DEPLOY_STAGES = [
  { id: 'queued', label: 'Queued', description: 'Waiting in deployment queue...' },
  { id: 'building', label: 'Building', description: 'Building your bot container...' },
  { id: 'deploying', label: 'Deploying', description: 'Starting services...' },
  { id: 'running', label: 'Live!', description: 'Your bot is online!' }
]

const BOT_CAPABILITIES = [
  { icon: '💬', title: 'Chat Anywhere', desc: 'Telegram, Discord, Slack & more' },
  { icon: '💻', title: 'Run Code', desc: 'Execute Python, JavaScript, Shell' },
  { icon: '📁', title: 'File Access', desc: 'Read, write & manage files' },
  { icon: '🌐', title: 'Web Browsing', desc: 'Search & fetch from the web' },
  { icon: '🖼️', title: 'Image Generation', desc: 'Create visuals with AI' },
  { icon: '🔧', title: 'Custom Tools', desc: 'Extend with plugins' },
  { icon: '🧠', title: 'Memory', desc: 'Remembers context across chats' },
  { icon: '📊', title: 'Data Analysis', desc: 'Process CSVs, JSONs & more' }
]

function DeploymentProgress({ instance, onRefresh }) {
  const [currentCapability, setCurrentCapability] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)

  // Cycle through capabilities
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentCapability(prev => (prev + 1) % BOT_CAPABILITIES.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  // Track elapsed time
  useEffect(() => {
    const startTime = instance?.createdAt ? new Date(instance.createdAt).getTime() : Date.now()
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [instance?.createdAt])

  // Determine current stage based on status
  const getCurrentStageIndex = () => {
    const status = instance?.status?.toLowerCase() || 'queued'
    if (status === 'running' || status === 'success') return 3
    if (status === 'deploying') return 2
    if (status === 'building' || status === 'pending') return 1 // pending = just started building
    return 0 // queued
  }

  const currentStageIndex = getCurrentStageIndex()
  const isComplete = currentStageIndex === 3
  const capability = BOT_CAPABILITIES[currentCapability]

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className={`deployment-progress ${isComplete ? 'complete' : ''}`}>
      {/* Progress Header */}
      <div className="progress-header">
        <div className="progress-title">
          {isComplete ? '🎉 Deployment Complete!' : '🚀 Deploying Your Bot...'}
        </div>
        <div className="progress-time">
          {formatTime(elapsedTime)} elapsed
        </div>
      </div>

      {/* Stage Progress */}
      <div className="stages-container">
        {DEPLOY_STAGES.map((stage, index) => (
          <div 
            key={stage.id}
            className={`stage ${index <= currentStageIndex ? 'active' : ''} ${index === currentStageIndex ? 'current' : ''}`}
          >
            <div className="stage-indicator">
              {index < currentStageIndex ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              ) : index === currentStageIndex && !isComplete ? (
                <div className="stage-spinner"></div>
              ) : (
                <span>{index + 1}</span>
              )}
            </div>
            <div className="stage-info">
              <span className="stage-label">{stage.label}</span>
              {index === currentStageIndex && (
                <span className="stage-desc">{stage.description}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Capabilities Showcase (only during deploy) */}
      {!isComplete && (
        <div className="capabilities-showcase">
          <div className="capability-card" key={currentCapability}>
            <div className="capability-icon">{capability.icon}</div>
            <div className="capability-content">
              <h4>{capability.title}</h4>
              <p>{capability.desc}</p>
            </div>
          </div>
          <div className="capability-dots">
            {BOT_CAPABILITIES.map((_, i) => (
              <span 
                key={i} 
                className={`dot ${i === currentCapability ? 'active' : ''}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Success State */}
      {isComplete && instance && (
        <div className="deploy-success-info">
          <div className="success-card">
            <div className="success-icon">✅</div>
            <div className="success-details">
              <h4>{instance.name}</h4>
              <p>Your bot is now live and ready to chat!</p>
              {instance.channels && (
                <div className="channels-list">
                  {instance.channels.map(ch => (
                    <span key={ch} className="channel-badge">{ch}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Estimated Time */}
      {!isComplete && (
        <div className="estimate-note">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          Usually takes 3-5 minutes
        </div>
      )}
    </div>
  )
}

export default DeploymentProgress
