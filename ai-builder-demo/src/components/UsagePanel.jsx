import { useState, useEffect } from 'react'
import './UsagePanel.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

const CREDIT_PACKAGES = [
  { id: 'credits_25', credits: 25, price: 25 },
  { id: 'credits_100', credits: 100, price: 95, popular: true },
  { id: 'credits_500', credits: 500, price: 450 }
]

function UsagePanel({ credits, privyId, onCreditsUpdate, showToast }) {
  const [showPackages, setShowPackages] = useState(false)
  const [purchasing, setPurchasing] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [usageStats, setUsageStats] = useState({
    spentThisMonth: 0,
    jobsThisMonth: 0,
    hoursThisMonth: 0
  })

  // Fetch transaction history
  useEffect(() => {
    if (!privyId) {
      setLoading(false)
      return
    }
    
    Promise.all([
      fetch(`${API_BASE}/jobs/credits/history?limit=20`, {
        headers: { 'x-privy-id': privyId }
      }).then(r => r.ok ? r.json() : { transactions: [] }),
      fetch(`${API_BASE}/jobs?limit=100`, {
        headers: { 'x-privy-id': privyId }
      }).then(r => r.ok ? r.json() : { jobs: [] })
    ])
      .then(([txData, jobsData]) => {
        setTransactions(txData.transactions || [])
        
        // Calculate this month's stats
        const now = new Date()
        const thisMonth = now.getMonth()
        const thisYear = now.getFullYear()
        
        const monthlyJobs = (jobsData.jobs || []).filter(j => {
          const d = new Date(j.createdAt)
          return d.getMonth() === thisMonth && d.getFullYear() === thisYear
        })
        
        const spent = monthlyJobs.reduce((sum, j) => sum + (j.costUsd || 0), 0)
        const hours = monthlyJobs.reduce((sum, j) => sum + (j.hours || 0) * (j.gpuCount || 1), 0)
        
        setUsageStats({
          spentThisMonth: spent,
          jobsThisMonth: monthlyJobs.length,
          hoursThisMonth: hours
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [privyId])

  const handlePurchase = async (packageId) => {
    if (!privyId) return
    setPurchasing(packageId)

    try {
      const response = await fetch(`${API_BASE}/payments/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-privy-id': privyId
        },
        body: JSON.stringify({ packageId })
      })
      const data = await response.json()
      if (data.url) window.location.href = data.url
      else throw new Error(data.error || 'Checkout failed')
    } catch (err) {
      showToast(err.message, 'error')
      setPurchasing(null)
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="usage-panel">
      <div className="usage-grid">
        {/* Balance Card */}
        <div className="usage-card balance-card">
          <div className="card-label">Available Balance</div>
          <div className="balance-row">
            <span className="balance-amount">${credits.toFixed(2)}</span>
            <button 
              className={`add-credits-btn ${showPackages ? 'active' : ''}`}
              onClick={() => setShowPackages(!showPackages)}
            >
              {showPackages ? 'Cancel' : 'Add Credits'}
            </button>
          </div>
          
          {showPackages && (
            <div className="packages-dropdown">
              {CREDIT_PACKAGES.map(pkg => (
                <button
                  key={pkg.id}
                  className={`package-row ${pkg.popular ? 'recommended' : ''}`}
                  onClick={() => handlePurchase(pkg.id)}
                  disabled={purchasing !== null}
                >
                  <div className="package-info">
                    <span className="package-credits">{pkg.credits} credits</span>
                    {pkg.popular && <span className="rec-tag">Best value</span>}
                  </div>
                  <span className="package-price">
                    {purchasing === pkg.id ? 'Processing...' : `$${pkg.price}`}
                  </span>
                </button>
              ))}
              <div className="stripe-note">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                Secured by Stripe
                <span className="test-hint">Test: 4242 4242 4242 4242</span>
              </div>
            </div>
          )}
        </div>

        {/* Usage Stats Card */}
        <div className="usage-card stats-card">
          <div className="card-label">This Month</div>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-value">${usageStats.spentThisMonth.toFixed(2)}</span>
              <span className="stat-label">Spent</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{usageStats.jobsThisMonth}</span>
              <span className="stat-label">Jobs</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{usageStats.hoursThisMonth.toFixed(1)}</span>
              <span className="stat-label">GPU Hours</span>
            </div>
          </div>
        </div>

        {/* Transaction History Card */}
        <div className="usage-card history-card">
          <div className="card-header-row">
            <div className="card-label">Transaction History</div>
          </div>
          
          {loading ? (
            <div className="empty-state">Loading...</div>
          ) : transactions.length === 0 ? (
            <div className="empty-state">No transactions yet</div>
          ) : (
            <div className="transactions-list">
              <div className="tx-header">
                <span>Type</span>
                <span>Description</span>
                <span>Amount</span>
                <span>Date</span>
              </div>
              {transactions.map(tx => (
                <div key={tx.id} className="tx-row">
                  <span className={`tx-type ${tx.type}`}>{tx.type}</span>
                  <span className="tx-desc">{tx.description || '—'}</span>
                  <span className={`tx-amount ${tx.amountUsd >= 0 ? 'positive' : ''}`}>
                    {tx.amountUsd >= 0 ? '+' : ''}{tx.amountUsd?.toFixed(2)}
                  </span>
                  <span className="tx-date">{formatDate(tx.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default UsagePanel
