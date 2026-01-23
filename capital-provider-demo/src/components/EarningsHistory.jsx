import { useState, useEffect } from 'react'
import './EarningsHistory.css'

function EarningsHistory({ history }) {
  const [animated, setAnimated] = useState(false)
  
  useEffect(() => {
    setTimeout(() => setAnimated(true), 500)
  }, [])

  const maxValue = Math.max(...history.map(h => h.yield + h.revenue))
  
  const totalYield = history.reduce((sum, h) => sum + h.yield, 0)
  const totalRevenue = history.reduce((sum, h) => sum + h.revenue, 0)

  return (
    <div className="history-card">
      <div className="history-header">
        <div className="history-left">
          <span className="history-title">Earnings History</span>
          <span className="history-period">Last 30 days</span>
        </div>
        <div className="history-summary">
          <div className="summary-item">
            <span className="summary-label">Yield</span>
            <span className="summary-value">+{totalYield.toFixed(1)} SOL</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Revenue</span>
            <span className="summary-value highlight">+{totalRevenue.toFixed(1)} SOL</span>
          </div>
        </div>
      </div>

      <div className="sparkline-container">
        {history.map((day, index) => {
          const totalHeight = ((day.yield + day.revenue) / maxValue) * 100
          const yieldHeight = (day.yield / maxValue) * 100
          const revenueHeight = (day.revenue / maxValue) * 100
          
          return (
            <div 
              key={index} 
              className="sparkline-bar-container"
              style={{ 
                animationDelay: `${index * 20}ms`,
                opacity: animated ? 1 : 0
              }}
            >
              <div className="sparkline-bar">
                <div 
                  className="bar-segment revenue"
                  style={{ height: animated ? `${revenueHeight}%` : '0%' }}
                />
                <div 
                  className="bar-segment yield"
                  style={{ height: animated ? `${yieldHeight}%` : '0%' }}
                />
              </div>
              <div className="bar-tooltip">
                <span>Day {30 - index}</span>
                <span>Yield: +{day.yield.toFixed(2)}</span>
                <span>Revenue: +{day.revenue.toFixed(2)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default EarningsHistory
