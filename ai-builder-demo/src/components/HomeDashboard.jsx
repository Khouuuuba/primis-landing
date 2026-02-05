import { useState, useEffect } from 'react'
import './HomeDashboard.css'

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/api$/, '') + '/api'

function HomeDashboard({ onNavigate, credits, privyId, showToast }) {
  const [stats, setStats] = useState({
    activeInstances: 0,
    totalDeployments: 0,
    monthlySpend: 0
  })
  const [recentActivity, setRecentActivity] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!privyId) return

    const fetchDashboardData = async () => {
      setIsLoading(true)
      try {
        // Fetch instances count
        const instancesRes = await fetch(`${API_URL}/instances`, {
          headers: { 'x-privy-id': privyId }
        })
        const instancesData = await instancesRes.json()
        const activeCount = (instancesData.instances || []).filter(i => i.status === 'running').length

        // Fetch deployments count
        const deploymentsRes = await fetch(`${API_URL}/agents`, {
          headers: { 'x-privy-id': privyId }
        })
        const deploymentsData = await deploymentsRes.json()
        const deploymentCount = (deploymentsData.agents || []).length

        // Fetch recent jobs for activity
        const jobsRes = await fetch(`${API_URL}/batch/jobs`, {
          headers: { 'x-privy-id': privyId }
        })
        const jobsData = await jobsRes.json()
        
        // Calculate monthly spend from jobs
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const monthlyJobs = (jobsData.jobs || []).filter(j => new Date(j.created_at) >= monthStart)
        const monthlySpend = monthlyJobs.reduce((sum, j) => sum + parseFloat(j.total_cost || 0), 0)

        setStats({
          activeInstances: activeCount,
          totalDeployments: deploymentCount,
          monthlySpend
        })

        // Build recent activity
        const activities = [
          ...(jobsData.jobs || []).slice(0, 3).map(j => ({
            id: j.id,
            type: 'job',
            title: `Image generation: ${j.total_items} images`,
            status: j.status,
            time: j.created_at,
            cost: j.total_cost
          })),
          ...(instancesData.instances || []).slice(0, 2).map(i => ({
            id: i.id,
            type: 'instance',
            title: `GPU Instance: ${i.gpu_type}`,
            status: i.status,
            time: i.created_at
          }))
        ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 5)

        setRecentActivity(activities)
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboardData()
  }, [privyId])

  const quickActions = [
    {
      id: 'moltbot',
      title: 'Deploy OpenClaw',
      description: 'Your AI assistant for Telegram, Discord & more',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="11" width="18" height="10" rx="2"/>
          <circle cx="12" cy="5" r="2"/>
          <path d="M12 7v4"/>
          <line x1="8" y1="16" x2="8" y2="16"/>
          <line x1="16" y1="16" x2="16" y2="16"/>
        </svg>
      ),
      color: '#c87832',
      primary: true
    },
    {
      id: 'serverless',
      title: 'Run Model',
      description: 'Generate images, text, or transcribe audio',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      ),
      color: '#666',
      locked: true
    },
    {
      id: 'instances',
      title: 'Launch GPU',
      description: 'Deploy dedicated GPU instances',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
          <line x1="6" y1="6" x2="6.01" y2="6"/>
          <line x1="6" y1="18" x2="6.01" y2="18"/>
        </svg>
      ),
      color: '#666',
      locked: true
    }
  ]

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const seconds = Math.floor((now - date) / 1000)
    
    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
      case 'running':
        return '#10b981'
      case 'processing':
      case 'pending':
        return '#f59e0b'
      case 'failed':
      case 'stopped':
        return '#ef4444'
      default:
        return 'var(--text-muted)'
    }
  }

  return (
    <div className="home-dashboard">
      {/* Welcome Header */}
      <div className="dashboard-header">
        <div>
          <h1>Welcome to Primis</h1>
          <p>Deploy your personal AI assistant in minutes</p>
        </div>
      </div>

      {/* Featured: OpenClaw */}
      <div className="featured-card" onClick={() => onNavigate('moltbot')}>
        <div className="featured-badge">Featured</div>
        <div className="featured-content">
          <div className="featured-icon">
            <span style={{ fontSize: '32px' }}>🦞</span>
          </div>
          <div className="featured-text">
            <h2>Deploy OpenClaw</h2>
            <p>Your AI assistant that lives in Telegram, Discord, and more. Powered by Claude or GPT.</p>
          </div>
          <div className="featured-cta">
            <span>Get Started</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </div>
        <div className="featured-stats">
          <div className="featured-stat">
            <span className="stat-number">162k+</span>
            <span className="stat-desc">GitHub Stars</span>
          </div>
          <div className="featured-stat">
            <span className="stat-number">$30</span>
            <span className="stat-desc">/month</span>
          </div>
          <div className="featured-stat">
            <span className="stat-number">5 min</span>
            <span className="stat-desc">to deploy</span>
          </div>
        </div>
      </div>

      {/* Stats Row - Hidden for public launch */}
      {/* Will show when compute features are unlocked */}

      {/* Quick Actions */}
      <div className="dashboard-section">
        <h2>More Features</h2>
        <p className="section-subtitle">Coming soon — request early access</p>
        <div className="quick-actions-grid">
          {quickActions.filter(a => a.locked).map(action => (
            <button
              key={action.id}
              className={`quick-action-card ${action.locked ? 'locked' : ''}`}
              onClick={() => onNavigate(action.id)}
            >
              <div className="action-icon" style={{ color: action.color, background: `${action.color}15` }}>
                {action.icon}
              </div>
              <div className="action-content">
                <h3>{action.title}</h3>
                <p>{action.description}</p>
              </div>
              <svg className="action-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Activity - Hidden for public launch */}
      {/* Will show when compute features are unlocked */}

      {/* Getting Started */}
      <div className="dashboard-section getting-started">
        <h2>Getting Started with OpenClaw</h2>
        <div className="getting-started-grid">
          <div className="guide-card">
            <div className="guide-number">1</div>
            <div className="guide-content">
              <h4>Choose Your AI</h4>
              <p>Select Claude (Anthropic) or GPT (OpenAI)</p>
            </div>
          </div>
          <div className="guide-card">
            <div className="guide-number">2</div>
            <div className="guide-content">
              <h4>Connect Channels</h4>
              <p>Add Telegram, Discord, or Slack bots</p>
            </div>
          </div>
          <div className="guide-card">
            <div className="guide-number">3</div>
            <div className="guide-content">
              <h4>Deploy & Chat</h4>
              <p>Your AI assistant is live in minutes</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HomeDashboard
