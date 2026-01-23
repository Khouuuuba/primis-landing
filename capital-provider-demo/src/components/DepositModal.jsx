import { useState } from 'react'
import './Modal.css'

const MINIMUM_STAKE = 10 // 10 SOL minimum for first deposit

function DepositModal({ wallet, onDeposit, onClose, isLoading, currentStake = 0 }) {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  
  const isFirstDeposit = currentStake === 0

  const handleAmountChange = (e) => {
    const value = e.target.value
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value)
      setError('')
    }
  }

  const setPercentage = (percent) => {
    const value = (wallet.balance * percent / 100).toFixed(2)
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
    
    if (numAmount > wallet.balance) {
      setError('Insufficient balance')
      return
    }
    
    // Check minimum stake for first deposit
    if (isFirstDeposit && numAmount < MINIMUM_STAKE) {
      setError(`Minimum first deposit is ${MINIMUM_STAKE} SOL`)
      return
    }

    onDeposit(numAmount)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Deposit SOL</h2>
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
              <span>Wallet Balance</span>
              <span>{wallet.balance.toFixed(4)} SOL</span>
            </div>
            {isFirstDeposit && (
              <div className="info-row highlight-row">
                <span>Minimum First Deposit</span>
                <span className="highlight">{MINIMUM_STAKE} SOL</span>
              </div>
            )}
            {currentStake > 0 && (
              <div className="info-row">
                <span>Current Stake</span>
                <span>{currentStake.toFixed(4)} SOL</span>
              </div>
            )}
            <div className="info-row">
              <span>Network</span>
              <span className="devnet-badge">Devnet</span>
            </div>
            <div className="info-row">
              <span>Current APY</span>
              <span className="highlight">~7.4%</span>
            </div>
          </div>

          <button 
            type="submit" 
            className="modal-submit"
            disabled={isLoading || !amount}
          >
            {isLoading ? (
              <>
                <span className="spinner"></span>
                Processing...
              </>
            ) : (
              'Deposit'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default DepositModal
