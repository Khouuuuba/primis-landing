import { useState, useEffect } from 'react'
import './BuyCreditsModal.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

function BuyCreditsModal({ onClose, privyId, onSuccess }) {
  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(null)
  const [error, setError] = useState(null)

  // Fetch available packages
  useEffect(() => {
    fetch(`${API_BASE}/payments/packages`)
      .then(res => res.json())
      .then(data => {
        setPackages(data.packages)
        setLoading(false)
      })
      .catch(err => {
        setError('Failed to load packages')
        setLoading(false)
      })
  }, [])

  const handlePurchase = async (packageId) => {
    if (!privyId) {
      setError('Please sign in to purchase credits')
      return
    }

    setPurchasing(packageId)
    setError(null)

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

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout')
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url

    } catch (err) {
      setError(err.message)
      setPurchasing(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content buy-credits-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Buy Credits</h2>
          <button className="close-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="modal-subtitle">
          Credits are used to pay for GPU compute time. 1 credit = $1 USD.
        </p>

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading packages...</p>
          </div>
        ) : (
          <div className="packages-grid">
            {packages.map(pkg => (
              <div 
                key={pkg.id} 
                className={`package-card ${pkg.popular ? 'popular' : ''}`}
              >
                {pkg.popular && <div className="popular-badge">Most Popular</div>}
                
                <h3>{pkg.name}</h3>
                <div className="credits-amount">{pkg.credits} credits</div>
                <div className="price">${pkg.price}</div>
                <p className="description">{pkg.description}</p>
                
                {pkg.credits > 25 && (
                  <div className="savings">
                    Save {pkg.id === 'credits_100' ? '5%' : '10%'}
                  </div>
                )}

                <button
                  className={`purchase-btn ${purchasing === pkg.id ? 'loading' : ''}`}
                  onClick={() => handlePurchase(pkg.id)}
                  disabled={purchasing !== null}
                >
                  {purchasing === pkg.id ? (
                    <>
                      <span className="btn-spinner"></span>
                      Processing...
                    </>
                  ) : (
                    `Buy for $${pkg.price}`
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <div className="secure-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            Secured by Stripe
          </div>
          <p className="test-mode-notice">
            Test mode: Use card 4242 4242 4242 4242
          </p>
        </div>
      </div>
    </div>
  )
}

export default BuyCreditsModal
