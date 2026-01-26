import { useState, useEffect } from 'react'
import ApyComparison from './ApyComparison'
import YourEarnings from './YourEarnings'
import './Dashboard.css'

function Dashboard({ wallet, portfolio, onDeposit, onWithdraw, onChainStake, vaultState, onRefresh }) {
  const [visibleCards, setVisibleCards] = useState([])

  useEffect(() => {
    // Stagger card animations (Minimal 3-section layout)
    const cards = ['header', 'actions', 'yourearnings', 'apy']
    cards.forEach((card, index) => {
      setTimeout(() => {
        setVisibleCards(prev => [...prev, card])
      }, index * 100)
    })
  }, [])

  if (!portfolio) return null

  const isCardVisible = (card) => visibleCards.includes(card)

  // Truncate address for welcome
  const truncatedAddress = wallet?.address 
    ? `${wallet.address.slice(0, 4)}...${wallet.address.slice(-4)}`
    : ''
  
  // Use on-chain data when available
  const displayStakedAmount = onChainStake?.amount ?? portfolio.stakedAmount
  const isOnChain = onChainStake !== null
  
  // Check if user has deposited (for conditional rendering)
  const hasDeposit = displayStakedAmount > 0

  return (
    <div className="dashboard">
      <div className={`dashboard-header animate-card ${isCardVisible('header') ? 'visible' : ''}`}>
        <div className="dashboard-title">
          <h1>Portfolio</h1>
          <div className="portfolio-status">
            <span className="status-dot"></span>
            <span>Connected</span>
            {isOnChain && (
              <span className="network-badge">Devnet</span>
            )}
          </div>
        </div>
        <div className="dashboard-meta">
          <span className="welcome-address">{truncatedAddress}</span>
          <span>·</span>
          <span>Epoch {portfolio.currentEpoch}</span>
          <span>·</span>
          <span className="user-stake">
            {displayStakedAmount > 0 
              ? `${displayStakedAmount.toFixed(2)} SOL staked`
              : 'No active stake'
            }
          </span>
        </div>
      </div>

      <div className={`dashboard-actions animate-card ${isCardVisible('actions') ? 'visible' : ''}`}>
        <button className="action-btn primary" onClick={onDeposit}>
          Deposit SOL
        </button>
        <button className="action-btn secondary" onClick={onWithdraw}>
          Withdraw
        </button>
      </div>

      <div className={`animate-card ${isCardVisible('yourearnings') ? 'visible' : ''}`}>
        <YourEarnings 
          wallet={wallet} 
          onChainStake={onChainStake} 
          vaultState={vaultState}
          portfolio={portfolio}
          onClaim={onRefresh}
        />
      </div>

      <div className={`animate-card ${isCardVisible('apy') ? 'visible' : ''}`}>
        <ApyComparison userStakeSOL={displayStakedAmount} hasDeposit={hasDeposit} />
      </div>
    </div>
  )
}

export default Dashboard
