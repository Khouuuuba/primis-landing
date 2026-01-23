import { useState, useEffect } from 'react'
import './AllocationChart.css'

function AllocationChart({ allocation }) {
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    setTimeout(() => setAnimated(true), 300)
  }, [])

  return (
    <div className="allocation-card">
      <div className="allocation-header">
        <span className="allocation-title">Yield Allocation</span>
        <div className="allocation-tabs">
          <span className="allocation-tab">This epoch</span>
          <span className="allocation-tab active">Last 30d</span>
          <span className="allocation-tab">All time</span>
        </div>
      </div>

      <div className="allocation-bar">
        <div 
          className="allocation-segment staker" 
          style={{ width: animated ? `${allocation.staker}%` : '0%' }}
        />
        <div 
          className="allocation-segment subsidy" 
          style={{ width: animated ? `${allocation.subsidy}%` : '0%' }}
        />
        <div 
          className="allocation-segment reserve" 
          style={{ width: animated ? `${allocation.reserve}%` : '0%' }}
        />
      </div>

      <div className="allocation-legend">
        <div className="legend-item">
          <span className="legend-dot staker"></span>
          <span className="legend-label">Staker</span>
          <span className="legend-value">{allocation.staker}%</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot subsidy"></span>
          <span className="legend-label">Compute Subsidy</span>
          <span className="legend-value">{allocation.subsidy}%</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot reserve"></span>
          <span className="legend-label">Protocol Reserve</span>
          <span className="legend-value">{allocation.reserve}%</span>
        </div>
      </div>
    </div>
  )
}

export default AllocationChart
