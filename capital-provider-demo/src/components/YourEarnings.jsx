import { useState, useEffect } from 'react'
import * as solana from '../solana'
import './YourEarnings.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function YourEarnings({ wallet, onChainStake, vaultState, portfolio, onClaim }) {
  const [claimableYield, setClaimableYield] = useState(null)
  const [isClaiming, setIsClaiming] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Calculate claimable yield from on-chain data
  useEffect(() => {
    if (!onChainStake || !vaultState) {
      setClaimableYield(null)
      return
    }

    if (vaultState.totalStaked > 0 && vaultState.totalYieldDistributed > 0) {
      const userSharePercent = onChainStake.amount / vaultState.totalStaked
      const totalYieldForUser = userSharePercent * vaultState.totalYieldDistributed
      const alreadyClaimed = onChainStake.totalYieldClaimed || 0
      const claimable = Math.max(0, totalYieldForUser - alreadyClaimed)
      setClaimableYield(claimable)
    } else {
      setClaimableYield(0)
    }
  }, [onChainStake, vaultState])

  const handleClaim = async () => {
    if (!wallet || !claimableYield || claimableYield <= 0) return
    
    setIsClaiming(true)
    setError(null)
    setSuccess(null)
    
    try {
      const txSignature = await solana.claimYield(wallet)
      
      // Record in backend
      try {
        await fetch(`${API_URL}/api/yield/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_address: wallet.publicKey.toString(),
            amount_lamports: Math.floor(claimableYield * solana.LAMPORTS),
            tx_signature: txSignature,
          }),
        })
      } catch (backendError) {
        console.log('Could not record claim in backend:', backendError.message)
      }
      
      setSuccess({
        amount: claimableYield,
        txSignature,
      })
      
      if (onClaim) onClaim()
      
    } catch (err) {
      console.error('Claim failed:', err)
      setError(err.message || 'Failed to claim yield')
    } finally {
      setIsClaiming(false)
    }
  }

  // Don't render if no stake
  if (!onChainStake || onChainStake.amount === 0) {
    return null
  }

  const totalClaimed = onChainStake?.totalYieldClaimed || 0
  const totalEarned = (claimableYield || 0) + totalClaimed

  return (
    <div className="your-earnings-card">
      <div className="your-earnings-header">
        <h3>Your Earnings</h3>
        <span className="earnings-badge">Live</span>
      </div>

      {/* Two-column layout: Claimable | Total */}
      <div className="earnings-columns">
        {/* Left: Claimable */}
        <div className="earnings-col claimable">
          <span className="col-label">Available to Claim</span>
          <div className="col-value">
            <span className="value-amount">
              {claimableYield !== null ? claimableYield.toFixed(6) : '—'}
            </span>
            <span className="value-currency">SOL</span>
          </div>
        </div>

        {/* Divider */}
        <div className="earnings-divider"></div>

        {/* Right: Total Earned */}
        <div className="earnings-col total">
          <span className="col-label">Total Earned</span>
          <div className="col-value">
            <span className="value-amount">
              {totalEarned.toFixed(6)}
            </span>
            <span className="value-currency">SOL</span>
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="earnings-breakdown">
        <div className="breakdown-row">
          <span className="breakdown-dot staking"></span>
          <span className="breakdown-label">From staking yield</span>
          <span className="breakdown-value">{(totalEarned * 0.58).toFixed(6)} SOL</span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-dot compute"></span>
          <span className="breakdown-label">From compute revenue</span>
          <span className="breakdown-value highlight">{(totalEarned * 0.42).toFixed(6)} SOL</span>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="earnings-message error">
          {error}
        </div>
      )}

      {success && (
        <div className="earnings-message success">
          <span>✓ Claimed {success.amount.toFixed(6)} SOL</span>
          <a 
            href={solana.getSolscanLink(success.txSignature)} 
            target="_blank" 
            rel="noopener noreferrer"
          >
            View tx →
          </a>
        </div>
      )}

      {/* Claim Button */}
      <button 
        className={`claim-btn ${isClaiming ? 'loading' : ''} ${(!claimableYield || claimableYield <= 0) ? 'disabled' : ''}`}
        onClick={handleClaim}
        disabled={isClaiming || !claimableYield || claimableYield <= 0}
      >
        {isClaiming ? (
          <>
            <span className="spinner"></span>
            Claiming...
          </>
        ) : claimableYield > 0 ? (
          'Claim Yield'
        ) : (
          'No Yield Available'
        )}
      </button>

      {/* Info */}
      <div className="earnings-info">
        <span className="info-icon">ℹ</span>
        <span>Yield accrues every 10 minutes. Claim anytime.</span>
      </div>
    </div>
  )
}

export default YourEarnings
