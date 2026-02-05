import { useState } from 'react'
import './InstanceCard.css'

function InstanceCard({ instance, onStop, onRestart, onTerminate, onRefresh }) {
  const [copied, setCopied] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const getStatusDisplay = (status) => {
    switch (status) {
      case 'pending': return 'Pending'
      case 'starting': return 'Starting'
      case 'running': return 'Running'
      case 'stopping': return 'Stopping'
      case 'stopped': return 'Stopped'
      case 'terminated': return 'Terminated'
      case 'error': return 'Error'
      default: return status
    }
  }

  const formatRuntime = (seconds) => {
    if (!seconds) return '--'
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  const formatCost = (cost) => {
    if (!cost) return '$0.00'
    return `$${parseFloat(cost).toFixed(4)}`
  }

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const getSshCommand = () => {
    if (!instance.ssh_host || !instance.ssh_port) return null
    return `ssh root@${instance.ssh_host} -p ${instance.ssh_port}`
  }

  const isRunning = instance.status === 'running'
  const isStarting = instance.status === 'starting' || instance.status === 'pending'
  const isStopped = instance.status === 'stopped'
  const canConnect = isRunning && (instance.ssh_host || instance.jupyter_url)

  return (
    <div className={`instance-card ${instance.status}`}>
      {/* Header */}
      <div className="instance-header">
        <div className="instance-info">
          <div className="instance-title">
            <span className="instance-name">{instance.name || `Instance ${instance.id?.slice(0, 8)}`}</span>
            <span className={`status-badge ${instance.status}`}>
              {(isRunning || isStarting) && <span className="status-dot"></span>}
              {getStatusDisplay(instance.status)}
            </span>
          </div>
          <div className="instance-meta">
            <span className="provider-badge">{instance.provider || 'runpod'}</span>
            <span>{instance.gpu_type}</span>
            {instance.gpu_count > 1 && <span>×{instance.gpu_count}</span>}
            <span className="meta-sep">·</span>
            <span>{formatCost(instance.cost_per_hour)}/hr</span>
          </div>
        </div>

        <div className="instance-actions">
          {isRunning && (
            <button className="action-btn stop" onClick={() => onStop?.(instance.id)} title="Stop">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="6" width="12" height="12" rx="1"/>
              </svg>
            </button>
          )}
          {isStopped && (
            <button className="action-btn restart" onClick={() => onRestart?.(instance.id)} title="Restart">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5,3 19,12 5,21"/>
              </svg>
            </button>
          )}
          {!showConfirm ? (
            <button 
              className="action-btn terminate" 
              onClick={() => setShowConfirm(true)} 
              title="Terminate"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          ) : (
            <div className="confirm-terminate">
              <button className="confirm-yes" onClick={() => { onTerminate?.(instance.id); setShowConfirm(false) }}>
                Terminate
              </button>
              <button className="confirm-no" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Connection Panel - Only when running */}
      {canConnect && (
        <div className="connection-panel">
          <h4 className="connection-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>
            </svg>
            Connection
          </h4>

          <div className="connection-items">
            {/* SSH */}
            {instance.ssh_host && instance.ssh_port && (
              <div className="connection-item">
                <span className="connection-label">SSH</span>
                <div className="connection-value">
                  <code>{getSshCommand()}</code>
                  <button 
                    className={`copy-btn ${copied === 'ssh' ? 'copied' : ''}`}
                    onClick={() => copyToClipboard(getSshCommand(), 'ssh')}
                  >
                    {copied === 'ssh' ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20,6 9,17 4,12"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2"/>
                        <path d="M5 15V5a2 2 0 0 1 2-2h10"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Jupyter */}
            {instance.jupyter_url && (
              <div className="connection-item">
                <span className="connection-label">Jupyter</span>
                <div className="connection-value">
                  <a href={instance.jupyter_url} target="_blank" rel="noopener noreferrer" className="jupyter-link">
                    Open Jupyter Lab
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15,3 21,3 21,9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                </div>
              </div>
            )}

            {/* API URL if available */}
            {instance.api_url && (
              <div className="connection-item">
                <span className="connection-label">API</span>
                <div className="connection-value">
                  <code>{instance.api_url}</code>
                  <button 
                    className={`copy-btn ${copied === 'api' ? 'copied' : ''}`}
                    onClick={() => copyToClipboard(instance.api_url, 'api')}
                  >
                    {copied === 'api' ? '✓' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Starting message */}
      {isStarting && (
        <div className="starting-message">
          <div className="starting-spinner"></div>
          <span>Instance is starting... This may take 1-2 minutes.</span>
        </div>
      )}

      {/* Runtime & Cost Footer */}
      {(isRunning || instance.total_runtime_seconds > 0) && (
        <div className="instance-footer">
          <div className="footer-stat">
            <span className="footer-label">Runtime</span>
            <span className="footer-value">{formatRuntime(instance.runtime_seconds || instance.total_runtime_seconds)}</span>
          </div>
          <div className="footer-stat">
            <span className="footer-label">Session Cost</span>
            <span className="footer-value cost">{formatCost(instance.session_cost || instance.total_cost_usd)}</span>
          </div>
          {onRefresh && (
            <button className="refresh-btn" onClick={() => onRefresh(instance.id)} title="Refresh status">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M23 4v6h-6"/>
                <path d="M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default InstanceCard
