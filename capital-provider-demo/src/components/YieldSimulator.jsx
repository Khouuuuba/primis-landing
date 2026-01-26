import { useState, useEffect } from 'react'
import './YieldSimulator.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const DISTRIBUTION_INTERVAL_MINUTES = 10

function YieldSimulator({ vaultState, onChainStake }) {
  const [yieldStats, setYieldStats] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch yield stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`${API_URL}/api/yield/stats`)
        const data = await response.json()
        if (data.success) {
          setYieldStats(data.stats)
        }
      } catch (err) {
        console.log('Could not fetch yield stats:', err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 60000)
    return () => clearInterval(interval)
  }, [])

  // Countdown timer
  useEffect(() => {
    const calculateCountdown = () => {
      const now = new Date()
      const minutes = now.getMinutes()
      const nextMinute = Math.ceil(minutes / DISTRIBUTION_INTERVAL_MINUTES) * DISTRIBUTION_INTERVAL_MINUTES
      
      const nextDistribution = new Date(now)
      if (nextMinute >= 60) {
        nextDistribution.setHours(nextDistribution.getHours() + 1)
        nextDistribution.setMinutes(nextMinute - 60)
      } else {
        nextDistribution.setMinutes(nextMinute)
      }
      nextDistribution.setSeconds(0)
      nextDistribution.setMilliseconds(0)

      const diff = nextDistribution - now
      
      if (diff <= 0) {
        setCountdown({ minutes: DISTRIBUTION_INTERVAL_MINUTES, seconds: 0 })
        return
      }

      setCountdown({
        minutes: Math.floor(diff / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      })
    }

    calculateCountdown()
    const interval = setInterval(calculateCountdown, 1000)
    return () => clearInterval(interval)
  }, [])

  // Calculate estimated yield
  const estimateNextYield = () => {
    if (!vaultState || !onChainStake || vaultState.totalStaked === 0) return 0
    
    const userSharePercent = onChainStake.amount / vaultState.totalStaked
    const annualYield = vaultState.totalStaked * 0.12
    const perDistributionYield = annualYield / (365 * 24 * 6)
    const stakerShare = perDistributionYield * 0.70
    return stakerShare * userSharePercent
  }

  const estimatedYield = estimateNextYield()
  const distributionCount = yieldStats?.totals?.distributionCount || 0
  const totalDistributed = yieldStats?.totals?.distributedSOL || 0

  if (loading) {
    return (
      <div className="yield-compact loading">
        <div className="yield-compact-skeleton"></div>
      </div>
    )
  }

  return (
    <div className="yield-compact">
      {/* Main row: Label + Timer + Estimated */}
      <div className="yield-compact-main">
        <div className="yield-compact-left">
          <span className="yield-compact-label">Next Distribution</span>
          <span className="devnet-tag">DEVNET</span>
        </div>
        
        <div className="yield-compact-timer">
          <span className="timer-value">
            {countdown ? `${String(countdown.minutes).padStart(2, '0')}:${String(countdown.seconds).padStart(2, '0')}` : '--:--'}
          </span>
        </div>

        {onChainStake && onChainStake.amount > 0 && (
          <div className="yield-compact-estimate">
            <span className="estimate-label">You'll receive</span>
            <span className="estimate-value">+{estimatedYield.toFixed(6)} SOL</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="yield-compact-stats">
        <div className="compact-stat">
          <span className="compact-stat-value">{distributionCount}</span>
          <span className="compact-stat-label">distributions</span>
        </div>
        <div className="compact-stat-divider"></div>
        <div className="compact-stat">
          <span className="compact-stat-value">{totalDistributed.toFixed(4)}</span>
          <span className="compact-stat-label">SOL distributed</span>
        </div>
        <div className="compact-stat-divider"></div>
        <div className="compact-stat">
          <span className="compact-stat-value">10 min</span>
          <span className="compact-stat-label">interval</span>
        </div>
      </div>
    </div>
  )
}

export default YieldSimulator
