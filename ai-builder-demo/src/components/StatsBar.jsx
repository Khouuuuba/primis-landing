import { useState, useEffect } from 'react'
import './StatsBar.css'

function StatsBar({ availableGpus, runningJobs, pendingJobs, completedJobs, totalSaved }) {
  const [gpuUtilization, setGpuUtilization] = useState(73.2)

  useEffect(() => {
    const interval = setInterval(() => {
      setGpuUtilization(prev => {
        const delta = (Math.random() - 0.5) * 4
        return Math.max(60, Math.min(95, prev + delta))
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="stats-bar">
      <div className="stats-inner">
        <div className="stat">
          <span className="stat-value">{availableGpus.toLocaleString()}</span>
          <span className="stat-label">GPUs Available</span>
        </div>

        <div className="stat-divider"></div>

        <div className="stat">
          <span className="stat-value">
            {runningJobs > 0 && <span className="running-dot"></span>}
            {runningJobs}
          </span>
          <span className="stat-label">Running</span>
        </div>

        <div className="stat-divider"></div>

        <div className="stat">
          <span className="stat-value">{pendingJobs}</span>
          <span className="stat-label">Pending</span>
        </div>

        <div className="stat-divider"></div>

        <div className="stat">
          <span className="stat-value">{completedJobs}</span>
          <span className="stat-label">Completed</span>
        </div>

        <div className="stat-divider"></div>

        <div className="stat">
          <span className="stat-value ticker">{gpuUtilization.toFixed(1)}%</span>
          <span className="stat-label">Network Load</span>
        </div>

        <div className="stat highlight">
          <span className="stat-value saved">${totalSaved.toFixed(2)}</span>
          <span className="stat-label">Total Saved</span>
        </div>
      </div>
    </div>
  )
}

export default StatsBar
