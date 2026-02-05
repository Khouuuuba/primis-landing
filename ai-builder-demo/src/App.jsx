import { useState, useCallback, useEffect } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import Sidebar from './components/Sidebar'
import HomeDashboard from './components/HomeDashboard'
import ConnectWallet from './components/ConnectWallet'
import AgentsPanel from './components/AgentsPanel'
import ServerlessPanel from './components/ServerlessPanel'
import InstancesPanel from './components/InstancesPanel'
import FilesPanel from './components/FilesPanel'
import UsagePanel from './components/UsagePanel'
import ApiKeysPanel from './components/ApiKeysPanel'
import MoltbotPanel from './components/MoltbotPanel'
import LockedFeatureModal from './components/LockedFeatureModal'
import Toast from './components/Toast'
import * as api from './api'
import './App.css'

// Features that require access code (locked for public launch)
const LOCKED_FEATURES = {
  serverless: 'Serverless Compute',
  instances: 'GPU Instances',
  agents: 'Deployments',
  files: 'File Storage',
  usage: 'Usage & Billing',
  keys: 'API Keys'
}

function App() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const [credits, setCredits] = useState(500.00) // USD credits
  const [toasts, setToasts] = useState([])
  const [backendConnected, setBackendConnected] = useState(false)
  
  // Initialize activeTab from URL param or localStorage
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const urlTab = params.get('tab')
    if (urlTab && !['serverless', 'instances', 'agents', 'files', 'usage', 'keys'].includes(urlTab)) {
      return urlTab
    }
    return localStorage.getItem('primis_activeTab') || 'home'
  })
  
  const [loadingTime, setLoadingTime] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [lockedModal, setLockedModal] = useState({ isOpen: false, featureName: '' })
  
  // Persist activeTab to localStorage
  useEffect(() => {
    localStorage.setItem('primis_activeTab', activeTab)
  }, [activeTab])

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  // Check backend connectivity on mount
  useEffect(() => {
    api.checkHealth().then(result => {
      setBackendConnected(result.connected)
      if (result.connected) {
        console.log('Backend connected:', result)
      }
    })
  }, [])

  // Handle URL params (tab navigation, payment redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    const openclawStatus = params.get('openclaw')
    const payment = params.get('payment')
    const sessionId = params.get('session_id')

    // Auto-navigate to tab if specified in URL (e.g., after Stripe redirect)
    if (tab && !LOCKED_FEATURES[tab]) {
      setActiveTab(tab)
      // Clear tab param from URL
      params.delete('tab')
      const newUrl = params.toString() 
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname
      window.history.replaceState({}, '', newUrl)
    }
    
    // Handle OpenClaw payment redirect
    if (openclawStatus === 'success' || openclawStatus === 'cancelled') {
      setActiveTab('moltbot')
    }

    if (payment === 'success' && sessionId && user) {
      // Verify payment and update credits
      const verifyPayment = async () => {
        try {
          api.setPrivyId(user.id)
          const result = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/payments/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-privy-id': user.id
            },
            body: JSON.stringify({ sessionId })
          }).then(r => r.json())

          if (result.success) {
            setCredits(result.credits)
            showToast('Payment successful! Credits added to your account', 'success')
          }
        } catch (err) {
          console.error('Payment verification failed:', err)
        }
      }
      verifyPayment()
      
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname)
    } else if (payment === 'cancelled') {
      showToast('Payment cancelled', 'info')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [user, showToast])

  // Sync with backend when user logs in
  useEffect(() => {
    if (authenticated && user) {
      const syncWithBackend = async () => {
        try {
          // Set Privy ID for API requests
          api.setPrivyId(user.id)
          
          // Verify user with backend (creates account if new)
          const result = await api.verifyAuth({
            privyId: user.id,
            email: user.email?.address || user.google?.email
          })
          
          console.log('Backend sync:', result)
          
          // If new user, they get welcome credits
          if (result.isNew && result.welcomeCredits) {
            setCredits(result.welcomeCredits)
            showToast(`Welcome! You received $${result.welcomeCredits} in credits`, 'success')
          } else if (backendConnected) {
            // Fetch real credit balance
            try {
              const balance = await api.getCreditBalance()
              setCredits(balance.balance)
            } catch (err) {
              console.log('Using demo credits')
            }
          } else {
            showToast('Signed in successfully', 'success')
          }
        } catch (err) {
          console.error('Backend sync failed:', err)
          showToast('Signed in successfully', 'success')
        }
      }
      
      syncWithBackend()
    }
  }, [authenticated, user, backendConnected]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = () => {
    login()
  }

  const handleLogout = () => {
    logout()
    setCredits(500.00) // Reset credits on logout
    setActiveTab('home')
    setSidebarOpen(false)
    showToast('Signed out', 'info')
  }

  // Handle tab change and close mobile sidebar
  const handleTabChange = (tab) => {
    // Check if feature is locked
    if (LOCKED_FEATURES[tab]) {
      setLockedModal({ isOpen: true, featureName: LOCKED_FEATURES[tab] })
      setSidebarOpen(false)
      return
    }
    setActiveTab(tab)
    setSidebarOpen(false) // Close sidebar on mobile when navigating
  }

  // Close locked modal and navigate to OpenClaw
  const handleLockedModalClose = () => {
    setLockedModal({ isOpen: false, featureName: '' })
    setActiveTab('moltbot')
  }

  const handleCreditsChange = (amount) => {
    setCredits(prev => Math.max(0, prev + amount))
  }

  // Get user info for display
  const getUserInfo = () => {
    if (!user) return null
    return {
      email: user.email?.address || user.google?.email || 'User',
      org: 'AI Research Lab', // Would come from backend in production
      plan: 'Pro'
    }
  }

  // Show loading while Privy initializes (with timeout info)
  useEffect(() => {
    if (!ready) {
      const timer = setInterval(() => setLoadingTime(t => t + 1), 1000)
      return () => clearInterval(timer)
    }
  }, [ready])
  
  if (!ready) {
    return (
      <div className="app loading-screen">
        <div className="loading-spinner"></div>
        <p>Connecting to Privy...</p>
        {loadingTime > 3 && (
          <p style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
            Taking longer than expected... Check console for errors (F12)
          </p>
        )}
      </div>
    )
  }

  // Render main content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <HomeDashboard
            onNavigate={handleTabChange}
            credits={credits}
            privyId={user?.id}
            showToast={showToast}
          />
        )
      case 'serverless':
        return (
          <ServerlessPanel
            credits={credits}
            privyId={user?.id}
            onCreditsUpdate={setCredits}
            showToast={showToast}
          />
        )
      case 'instances':
        return (
          <InstancesPanel
            user={user}
            credits={credits}
          />
        )
      case 'agents':
        return (
          <AgentsPanel
            user={user}
            credits={credits}
            showToast={showToast}
          />
        )
      case 'files':
        return (
          <FilesPanel
            user={user}
          />
        )
      case 'usage':
        return (
          <UsagePanel
            credits={credits}
            privyId={user?.id}
            onCreditsUpdate={setCredits}
            showToast={showToast}
          />
        )
      case 'keys':
        return (
          <ApiKeysPanel
            privyId={user?.id}
            showToast={showToast}
          />
        )
      case 'moltbot':
        return (
          <MoltbotPanel
            user={user}
            showToast={showToast}
          />
        )
      default:
        return (
          <HomeDashboard
            onNavigate={handleTabChange}
            credits={credits}
            privyId={user?.id}
            showToast={showToast}
          />
        )
    }
  }

  return (
    <div className="app">
      {!authenticated ? (
        <ConnectWallet onLogin={handleLogin} />
      ) : (
        <div className="app-layout">
          {/* Mobile Header */}
          <header className="mobile-header">
            <button className="menu-toggle" onClick={() => setSidebarOpen(true)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <div className="mobile-logo">
              <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <mask id="ring-mobile">
                    <circle cx="50" cy="50" r="45" fill="white"/>
                    <ellipse cx="50" cy="48" rx="24" ry="20" fill="black"/>
                  </mask>
                </defs>
                <circle cx="50" cy="50" r="45" fill="#F2E8DE" mask="url(#ring-mobile)"/>
              </svg>
              <span>Primis</span>
            </div>
            <div className="mobile-credits">${credits.toFixed(0)}</div>
          </header>

          {/* Sidebar Overlay */}
          <div 
            className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
            onClick={() => setSidebarOpen(false)}
          />

          {/* Sidebar */}
          <Sidebar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onLogout={handleLogout}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />

          <main className="main-content">
            {renderContent()}
          </main>
        </div>
      )}

      <div className="toast-container">
        {toasts.map(toast => (
          <Toast key={toast.id} message={toast.message} type={toast.type} />
        ))}
      </div>

      {/* Locked Feature Modal */}
      <LockedFeatureModal
        isOpen={lockedModal.isOpen}
        onClose={handleLockedModalClose}
        featureName={lockedModal.featureName}
      />
    </div>
  )
}

export default App
