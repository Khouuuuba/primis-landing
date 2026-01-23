import { useState, useEffect } from 'react'
import * as solana from '../solana'
import './ClaimYield.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function ClaimYield({ wallet, onChainStake, vaultState, onClaim }) {
  const [claimableYield, setClaimableYield] = useState(null)
  const [isClaiming, setIsClaiming] = useState(false)
  const [lastClaim, setLastClaim] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Calculate claimable yield from on-chain data
  useEffect(() => {
    if (!onChainStake || !vaultState) {
      setClaimableYield(null)
      return
    }

    // User's share of total yield = (userStake / totalStaked) * totalYieldDistributed
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

  // Fetch claim history
  useEffect(() => {
    if (!wallet?.publicKey) return
    
    const fetchClaims = async () => {
      try {
        const response = await fetch(`${API_URL}/api/yield/claims/${wallet.publicKey.toString()}`)
        const data = await response.json()
        if (data.success && data.claims.length > 0) {
          setLastClaim(data.claims[0])
        }
      } catch (err) {
        console.log('Could not fetch claim history:', err.message)
      }
    }
    
    fetchClaims()
  }, [wallet?.publicKey])

  const handleClaim = async () => {
    if (!wallet || !claimableYield || claimableYield <= 0) return
    
    setIsClaiming(true)
    setError(null)
    setSuccess(null)
    
    try {
      // Call on-chain claim
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
      
      // Refresh stake account
      if (onClaim) {
        onClaim()
      }
      
    } catch (err) {
      console.error('Claim failed:', err)
      setError(err.message || 'Failed to claim yield')
    } finally {
      setIsClaiming(false)
    }
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (!onChainStake || onChainStake.amount === 0) {
    return null // Don't show if no stake
  }

  return (
    <div className="claim-yield-card">
      <div className="claim-yield-header">
        <div className="claim-yield-icon">💰</div>
        <div className="claim-yield-title">
          <h3>Yield Available</h3>
          <span className="claim-yield-subtitle">Claim your staking rewards</span>
        </div>
      </div>

      <div className="claim-yield-amount">
        <span className="amount-value">
          {claimableYield !== null ? claimableYield.toFixed(6) : '—'}
        </span>
        <span className="amount-currency">SOL</span>
      </div>

      {claimableYield !== null && claimableYield > 0 && (
        <div className="claim-yield-breakdown">
          <div className="breakdown-row">
            <span>Base staking (7% APY)</span>
            <span>{(claimableYield * 0.58).toFixed(6)} SOL</span>
          </div>
          <div className="breakdown-row highlight">
            <span>Compute bonus (5% APY)</span>
            <span>{(claimableYield * 0.42).toFixed(6)} SOL</span>
          </div>
        </div>
      )}

      {error && (
        <div className="claim-yield-error">
          {error}
        </div>
      )}

      {success && (
        <div className="claim-yield-success">
          <div className="success-icon">✓</div>
          <div className="success-content">
            <span>Claimed {success.amount.toFixed(6)} SOL</span>
            <a 
              href={solana.getSolscanLink(success.txSignature)} 
              target="_blank" 
              rel="noopener noreferrer"
              className="success-link"
            >
              View on Solscan →
            </a>
          </div>
        </div>
      )}

      <button 
        className={`claim-yield-btn ${isClaiming ? 'loading' : ''} ${(!claimableYield || claimableYield <= 0) ? 'disabled' : ''}`}
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

      {lastClaim && (
        <div className="claim-yield-history">
          <span className="history-label">Last claim:</span>
          <span className="history-value">{lastClaim.amount_sol} SOL</span>
          <span className="history-date">{formatDate(lastClaim.claimed_at)}</span>
        </div>
      )}

      <div className="claim-yield-info">
        <span className="info-icon">ℹ</span>
        <span>Yield accrues daily. Claim anytime to receive SOL directly to your wallet.</span>
      </div>
    </div>
  )
}

export default ClaimYield
