import { useEffect, useState } from 'react'
import './ActivityFeed.css'

function ActivityFeed({ activity, hasDeposit = false }) {
  const [visibleItems, setVisibleItems] = useState([])

  useEffect(() => {
    // Only animate if user has deposit
    if (!hasDeposit) return
    
    activity.forEach((item, index) => {
      setTimeout(() => {
        setVisibleItems(prev => [...prev, item.id])
      }, index * 150)
    })
  }, [hasDeposit])

  // Add new items with animation
  useEffect(() => {
    if (hasDeposit && activity.length > 0 && !visibleItems.includes(activity[0].id)) {
      setVisibleItems(prev => [activity[0].id, ...prev])
    }
  }, [activity, hasDeposit])

  const getTypeLabel = (type) => {
    switch (type) {
      case 'fine-tune': return 'FT'
      case 'embed-batch': return 'EB'
      case 'train': return 'TR'
      case 'inference': return 'IN'
      default: return '—'
    }
  }

  const getTypeColor = (type) => {
    switch (type) {
      case 'fine-tune': return 'fine-tune'
      case 'embed-batch': return 'embed'
      case 'train': return 'train'
      case 'inference': return 'inference'
      default: return ''
    }
  }

  // Show empty state if user hasn't deposited
  if (!hasDeposit) {
    return (
      <div className="activity-card">
        <div className="activity-header">
          <span className="activity-title">Recent Revenue</span>
          <span className="activity-hint">From network usage</span>
        </div>

        <div className="activity-empty">
          <span className="empty-icon">○</span>
          <span className="empty-text">No revenue yet</span>
          <span className="empty-hint">Deposit SOL to start earning compute fees</span>
        </div>

        <div className="activity-footer">
          <span>Your share of compute fees: 0 SOL</span>
        </div>
      </div>
    )
  }

  return (
    <div className="activity-card">
      <div className="activity-header">
        <span className="activity-title">Recent Revenue</span>
        <span className="activity-hint">From network usage</span>
      </div>

      <div className="activity-list">
        {activity.map((item, index) => (
          <div 
            key={item.id}
            className={`activity-item ${visibleItems.includes(item.id) ? 'visible' : ''} ${index === 0 && item.time === 'just now' ? 'new' : ''}`}
          >
            <div className="activity-left">
              <div className={`activity-badge ${getTypeColor(item.type)}`}>
                {getTypeLabel(item.type)}
              </div>
              <div className="activity-info">
                <span className={`activity-type ${getTypeColor(item.type)}`}>
                  {item.type}
                </span>
                <span className="activity-id">#{item.id}</span>
              </div>
            </div>
            <div className="activity-right">
              <span className="activity-amount">+{item.amount.toFixed(2)} SOL</span>
              <span className="activity-time">{item.time}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="activity-footer">
        <span>Your share of compute fees</span>
      </div>
    </div>
  )
}

export default ActivityFeed
