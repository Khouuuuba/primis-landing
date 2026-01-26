import { useState, useEffect } from 'react'
import './StatsBar.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const DISTRIBUTION_INTERVAL_MINUTES = 10

function StatsBar() {
  const [stats, setStats] = useState({
    tvl: 0,
    networkRevenue: 0
  })
  const [countdown, setCountdown] = useState(null)
  const [loading, setLoading] = useState(true)
  const [displayRevenue, setDisplayRevenue] = useState(0)

  // Fetch real stats from API
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_URL}/api/stats`)
        const data = await res.json()
        setStats({
          tvl: data.totalStakedSol || 0,
          networkRevenue: data.networkRevenueSol || 0
        })
        setDisplayRevenue(data.networkRevenueSol || 0)
        setLoading(false)
      } catch (error) {
        console.error('Failed to fetch stats:', error)
        setLoading(false)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  // Countdown timer for next distribution
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

  // Animate revenue ticking up
  useEffect(() => {
    if (stats.networkRevenue > 0) {
      const interval = setInterval(() => {
        setDisplayRevenue(prev => prev + 0.000001)
      }, 500)
      return () => clearInterval(interval)
    }
  }, [stats.networkRevenue])

  const formatSOL = (sol) => {
    if (sol >= 1000) return `${(sol / 1000).toFixed(1)}K`
    return sol.toFixed(2)
  }

  return (
    <div className="stats-bar">
      <div className="stats-bar-inner">
        {/* TVL */}
        <div className="stat-item">
          <span className="stat-label">TVL</span>
          <span className="stat-value">
            {loading ? '...' : `${formatSOL(stats.tvl)} SOL`}
          </span>
        </div>
        
        <div className="stat-divider"></div>
        
        {/* Staker Revenue */}
        <div className="stat-item live">
          <span className="stat-label">
            <span className="live-dot"></span>
            Staker Revenue
          </span>
          <span className="stat-value revenue">
            {loading ? '...' : `+${displayRevenue.toFixed(4)} SOL`}
          </span>
        </div>
        
        <div className="stat-divider"></div>
        
        {/* Next Distribution Countdown */}
        <div className="stat-item countdown">
          <span className="stat-label">Next Distribution</span>
          <span className="stat-value timer">
            {countdown 
              ? `${String(countdown.minutes).padStart(2, '0')}:${String(countdown.seconds).padStart(2, '0')}`
              : '--:--'
            }
          </span>
        </div>
      </div>
    </div>
  )
}

export default StatsBar
