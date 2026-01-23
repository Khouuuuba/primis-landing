import { useState, useEffect } from 'react'
import EarningsCard from './EarningsCard'
import StatsRow from './StatsRow'
import ApyComparison from './ApyComparison'
import AllocationChart from './AllocationChart'
import EarningsHistory from './EarningsHistory'
import ActivityFeed from './ActivityFeed'
import ClaimYield from './ClaimYield'
import './Dashboard.css'

function Dashboard({ wallet, portfolio, activity, earningsHistory, onDeposit, onWithdraw, onChainStake, vaultState, onRefresh }) {
  const [visibleCards, setVisibleCards] = useState([])

  useEffect(() => {
    // Stagger card animations
    const cards = ['header', 'actions', 'claim', 'earnings', 'stats', 'apy', 'allocation', 'history', 'activity']
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
  const displayYieldClaimed = onChainStake?.totalYieldClaimed ?? 0
  const isOnChain = onChainStake !== null

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
          {vaultState && (
            <>
              <span>{vaultState.stakerCount} stakers</span>
              <span>·</span>
              <span>{vaultState.totalStaked.toFixed(2)} SOL TVL</span>
            </>
          )}
          {!vaultState && <span>Revenue settles per epoch</span>}
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

      <div className={`animate-card ${isCardVisible('claim') ? 'visible' : ''}`}>
          <ClaimYield 
            wallet={wallet} 
            onChainStake={onChainStake} 
            vaultState={vaultState}
            onClaim={onRefresh}
          />
        </div>

      <div className="dashboard-grid">
        <div className="grid-main">
          <div className={`animate-card ${isCardVisible('earnings') ? 'visible' : ''}`}>
            <EarningsCard portfolio={portfolio} />
          </div>
          <div className={`animate-card ${isCardVisible('stats') ? 'visible' : ''}`}>
            <StatsRow portfolio={portfolio} />
          </div>
          <div className={`animate-card ${isCardVisible('apy') ? 'visible' : ''}`}>
            <ApyComparison effectiveApy={portfolio.effectiveApy} />
          </div>
          <div className={`animate-card ${isCardVisible('allocation') ? 'visible' : ''}`}>
            <AllocationChart allocation={portfolio.allocation} />
          </div>
          <div className={`animate-card ${isCardVisible('history') ? 'visible' : ''}`}>
            <EarningsHistory history={earningsHistory} />
          </div>
        </div>
        <div className="grid-sidebar">
          <div className={`animate-card ${isCardVisible('activity') ? 'visible' : ''}`}>
            <ActivityFeed activity={activity} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
