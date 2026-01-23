import { useState, useEffect } from 'react'
import './Toast.css'

function Toast({ message, amount, onClose }) {
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    // Animate in
    setTimeout(() => setIsVisible(true), 10)
    
    // Animate out and close
    const timer = setTimeout(() => {
      setIsLeaving(true)
      setTimeout(onClose, 300)
    }, 4000)

    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className={`toast ${isVisible ? 'visible' : ''} ${isLeaving ? 'leaving' : ''}`}>
      <div className="toast-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <div className="toast-content">
        <span className="toast-title">Revenue Received</span>
        <span className="toast-message">{message}</span>
      </div>
      <span className="toast-amount">+{amount.toFixed(2)} SOL</span>
    </div>
  )
}

export function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          amount={toast.amount}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  )
}

export default Toast
