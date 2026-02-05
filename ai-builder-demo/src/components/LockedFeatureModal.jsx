import { useState } from 'react'
import './LockedFeatureModal.css'

function LockedFeatureModal({ isOpen, onClose, featureName }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    // In production, this would validate the code against the backend
    setTimeout(() => {
      setError('Invalid access code. Join our waitlist for early access.')
      setIsSubmitting(false)
    }, 1000)
  }

  return (
    <div className="locked-modal-overlay" onClick={onClose}>
      <div className="locked-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div className="locked-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>

        <h2>Access Code Required</h2>
        <p className="locked-description">
          <strong>{featureName}</strong> is currently in private beta. 
          Enter your access code to unlock this feature.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="code-input-wrapper">
            <input
              type="text"
              placeholder="Enter access code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                setError('')
              }}
              maxLength={12}
              autoFocus
            />
          </div>
          
          {error && <p className="error-message">{error}</p>}

          <button 
            type="submit" 
            className="submit-btn"
            disabled={!code.trim() || isSubmitting}
          >
            {isSubmitting ? 'Verifying...' : 'Unlock Feature'}
          </button>
        </form>

        <div className="waitlist-section">
          <p>Don't have a code?</p>
          <a 
            href="https://primis.ai" 
            target="_blank" 
            rel="noopener noreferrer"
            className="waitlist-link"
          >
            Join the waitlist →
          </a>
        </div>

        <div className="available-now">
          <span className="divider-text">Available Now</span>
          <button className="openclaw-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="11" width="18" height="10" rx="2"/>
              <circle cx="12" cy="5" r="2"/>
              <path d="M12 7v4"/>
            </svg>
            Deploy OpenClaw Instead
          </button>
        </div>
      </div>
    </div>
  )
}

export default LockedFeatureModal
