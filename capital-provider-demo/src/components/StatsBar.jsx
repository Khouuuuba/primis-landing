import { useState, useEffect } from 'react'
import './StatsBar.css'

function StatsBar() {
  const [liveRevenue, setLiveRevenue] = useState(847.234)
  const [tvl, setTvl] = useState(4247832)
  const [stakers, setStakers] = useState(847)
  const [jobsProcessed, setJobsProcessed] = useState(12847)

  // Simulate live revenue ticking up
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveRevenue(prev => prev + (Math.random() * 0.01))
      
      // Occasionally increment other stats
      if (Math.random() > 0.95) {
        setJobsProcessed(prev => prev + 1)
      }
      if (Math.random() > 0.99) {
        setStakers(prev => prev + 1)
        setTvl(prev => prev + Math.floor(Math.random() * 5000))
      }
    }, 100)

    return () => clearInterval(interval)
  }, [])

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(2)}M`
    }
    if (num >= 1000) {
      return `$${(num / 1000).toFixed(1)}K`
    }
    return num.toLocaleString()
  }

  return (
    <div className="stats-bar">
      <div className="stats-bar-inner">
        <div className="stat-item">
          <span className="stat-label">Total Value Locked</span>
          <span className="stat-value">{formatNumber(tvl)}</span>
        </div>
        
        <div className="stat-divider"></div>
        
        <div className="stat-item">
          <span className="stat-label">Active Stakers</span>
          <span className="stat-value">{stakers.toLocaleString()}</span>
        </div>
        
        <div className="stat-divider"></div>
        
        <div className="stat-item">
          <span className="stat-label">Jobs Processed</span>
          <span className="stat-value">{jobsProcessed.toLocaleString()}</span>
        </div>
        
        <div className="stat-divider"></div>
        
        <div className="stat-item live">
          <span className="stat-label">
            <span className="live-dot"></span>
            Network Revenue
          </span>
          <span className="stat-value revenue">+{liveRevenue.toFixed(4)} SOL</span>
        </div>
      </div>
    </div>
  )
}

export default StatsBar
