import { useState } from 'react'
import './Modal.css'

function WithdrawModal({ portfolio, onWithdraw, onClose, isLoading }) {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  const handleAmountChange = (e) => {
    const value = e.target.value
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value)
      setError('')
    }
  }

  const setPercentage = (percent) => {
    const value = (portfolio.stakedAmount * percent / 100).toFixed(2)
    setAmount(value)
    setError('')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const numAmount = parseFloat(amount)
    
    if (!numAmount || numAmount <= 0) {
      setError('Please enter a valid amount')
      return
    }
    
    if (numAmount > portfolio.stakedAmount) {
      setError('Amount exceeds staked balance')
      return
    }

    onWithdraw(numAmount)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Withdraw SOL</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Amount</label>
            <div className="input-wrapper">
              <input
                type="text"
                value={amount}
                onChange={handleAmountChange}
                placeholder="0.00"
                autoFocus
              />
              <span className="input-suffix">SOL</span>
            </div>
            {error && <span className="input-error">{error}</span>}
          </div>

          <div className="amount-presets">
            <button type="button" onClick={() => setPercentage(25)}>25%</button>
            <button type="button" onClick={() => setPercentage(50)}>50%</button>
            <button type="button" onClick={() => setPercentage(75)}>75%</button>
            <button type="button" onClick={() => setPercentage(100)}>Max</button>
          </div>

          <div className="modal-info">
            <div className="info-row">
              <span>Staked Balance</span>
              <span>{portfolio.stakedAmount.toFixed(2)} SOL</span>
            </div>
            <div className="info-row">
              <span>Total Earned</span>
              <span className="highlight">+{portfolio.totalEarned.toFixed(2)} SOL</span>
            </div>
            <div className="info-row">
              <span>Processing Time</span>
              <span>~1 epoch</span>
            </div>
          </div>

          <button 
            type="submit" 
            className="modal-submit secondary"
            disabled={isLoading || !amount}
          >
            {isLoading ? (
              <>
                <span className="spinner"></span>
                Processing...
              </>
            ) : (
              'Withdraw'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default WithdrawModal
