import InstanceCard from './InstanceCard'
import './InstanceList.css'

function InstanceList({ instances, onStop, onRestart, onTerminate, onRefresh, loading }) {
  const activeInstances = instances.filter(i => 
    ['pending', 'starting', 'running', 'stopping'].includes(i.status)
  )
  const stoppedInstances = instances.filter(i => i.status === 'stopped')
  const terminatedInstances = instances.filter(i => i.status === 'terminated').slice(0, 3)

  if (loading) {
    return (
      <div className="card instance-list">
        <div className="card-header">
          <h2 className="card-title">
            <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
              <path d="M4 12h16"/>
              <path d="M12 4v16"/>
            </svg>
            Your Instances
          </h2>
        </div>
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <span>Loading instances...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="card instance-list">
      <div className="card-header">
        <h2 className="card-title">
          <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="4" y="4" width="16" height="16" rx="2"/>
            <path d="M4 12h16"/>
            <path d="M12 4v16"/>
          </svg>
          Your Instances
        </h2>
        <span className="card-badge">
          {activeInstances.length} active
        </span>
      </div>

      {instances.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
              <path d="M9 9h6v6H9z"/>
            </svg>
          </div>
          <p>No instances yet</p>
          <span>Launch a GPU instance to get started</span>
        </div>
      ) : (
        <div className="instances-container">
          {/* Active Instances */}
          {activeInstances.length > 0 && (
            <div className="instances-section">
              <h3 className="section-label">
                <span className="active-indicator"></span>
                Active
              </h3>
              <div className="instances-grid">
                {activeInstances.map(instance => (
                  <InstanceCard
                    key={instance.id}
                    instance={instance}
                    onStop={onStop}
                    onRestart={onRestart}
                    onTerminate={onTerminate}
                    onRefresh={onRefresh}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Stopped Instances */}
          {stoppedInstances.length > 0 && (
            <div className="instances-section">
              <h3 className="section-label">Stopped</h3>
              <div className="instances-grid">
                {stoppedInstances.map(instance => (
                  <InstanceCard
                    key={instance.id}
                    instance={instance}
                    onStop={onStop}
                    onRestart={onRestart}
                    onTerminate={onTerminate}
                    onRefresh={onRefresh}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recent Terminated */}
          {terminatedInstances.length > 0 && (
            <div className="instances-section">
              <h3 className="section-label">Recent</h3>
              <div className="terminated-list">
                {terminatedInstances.map(instance => (
                  <div key={instance.id} className="terminated-item">
                    <span className="terminated-name">{instance.name || `Instance ${instance.id?.slice(0, 8)}`}</span>
                    <span className="terminated-gpu">{instance.gpu_type}</span>
                    <span className="terminated-cost">${parseFloat(instance.total_cost_usd || 0).toFixed(2)}</span>
                    <span className="terminated-badge">Terminated</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default InstanceList
