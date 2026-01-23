import { useState, useCallback, useEffect } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import Header from './components/Header'
import ConnectWallet from './components/ConnectWallet'
import Dashboard from './components/Dashboard'
import UsagePanel from './components/UsagePanel'
import BatchPanel from './components/BatchPanel'
import Toast from './components/Toast'
import * as api from './api'
import './App.css'

function App() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const [credits, setCredits] = useState(500.00) // USD credits
  const [toasts, setToasts] = useState([])
  const [backendConnected, setBackendConnected] = useState(false)
  const [activeTab, setActiveTab] = useState('compute')

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

  // Handle payment redirect (success/cancel)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const payment = params.get('payment')
    const sessionId = params.get('session_id')

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
    showToast('Signed out', 'info')
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

  // Show loading while Privy initializes
  if (!ready) {
    return (
      <div className="app loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="app">
      <Header 
        isLoggedIn={authenticated}
        user={getUserInfo()}
        credits={credits}
        onLogout={handleLogout}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      
      {!authenticated ? (
        <ConnectWallet onLogin={handleLogin} />
      ) : activeTab === 'compute' ? (
        <Dashboard 
          credits={credits}
          onCreditsChange={handleCreditsChange}
          showToast={showToast}
        />
      ) : activeTab === 'batch' ? (
        <BatchPanel
          credits={credits}
          privyId={user?.id}
          onCreditsUpdate={setCredits}
          showToast={showToast}
        />
      ) : activeTab === 'usage' ? (
        <UsagePanel
          credits={credits}
          privyId={user?.id}
          onCreditsUpdate={setCredits}
          showToast={showToast}
        />
      ) : (
        <Dashboard 
          credits={credits}
          onCreditsChange={handleCreditsChange}
          showToast={showToast}
        />
      )}

      <div className="toast-container">
        {toasts.map(toast => (
          <Toast key={toast.id} message={toast.message} type={toast.type} />
        ))}
      </div>
    </div>
  )
}

export default App
