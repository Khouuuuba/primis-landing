import { useState, useEffect } from 'react'
import './EarningsCard.css'

function EarningsCard({ portfolio }) {
  const [displayTotal, setDisplayTotal] = useState(0)
  const [displayYield, setDisplayYield] = useState(0)
  const [displayRevenue, setDisplayRevenue] = useState(0)
  const [isHighlighted, setIsHighlighted] = useState(false)

  // Animate numbers on mount and when values change
  useEffect(() => {
    const duration = 1500
    const steps = 60
    const stepTime = duration / steps
    
    const totalStep = portfolio.totalEarned / steps
    const yieldStep = portfolio.yieldEarned / steps
    const revenueStep = portfolio.revenueEarned / steps
    
    let current = 0
    const interval = setInterval(() => {
      current++
      setDisplayTotal(prev => Math.min(prev + totalStep, portfolio.totalEarned))
      setDisplayYield(prev => Math.min(prev + yieldStep, portfolio.yieldEarned))
      setDisplayRevenue(prev => Math.min(prev + revenueStep, portfolio.revenueEarned))
      
      if (current >= steps) {
        clearInterval(interval)
        setDisplayTotal(portfolio.totalEarned)
        setDisplayYield(portfolio.yieldEarned)
        setDisplayRevenue(portfolio.revenueEarned)
      }
    }, stepTime)

    return () => clearInterval(interval)
  }, [portfolio.totalEarned, portfolio.yieldEarned, portfolio.revenueEarned])

  // Highlight effect when revenue updates
  useEffect(() => {
    setIsHighlighted(true)
    const timeout = setTimeout(() => setIsHighlighted(false), 1000)
    return () => clearTimeout(timeout)
  }, [portfolio.revenueEarned])

  return (
    <div className={`earnings-card ${isHighlighted ? 'highlighted' : ''}`}>
      <div className="earnings-header">
        <div className="earnings-label">Total Earned</div>
        <div className="earnings-period">Since deposit · {portfolio.daysStaked} days</div>
      </div>
      
      <div className="earnings-value">
        +{displayTotal.toFixed(2)} <span className="currency">SOL</span>
      </div>
      
      <div className="earnings-note">All values settle per epoch</div>
      
      <div className="earnings-breakdown">
        <div className="breakdown-item">
          <div className="breakdown-indicator yield"></div>
          <div className="breakdown-content">
            <span className="breakdown-label">Yield from staking</span>
            <span className="breakdown-value">+{displayYield.toFixed(2)} SOL</span>
          </div>
        </div>
        <div className="breakdown-item">
          <div className="breakdown-indicator revenue"></div>
          <div className="breakdown-content">
            <span className="breakdown-label">Revenue from compute</span>
            <span className="breakdown-value highlight">+{displayRevenue.toFixed(2)} SOL</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default EarningsCard
