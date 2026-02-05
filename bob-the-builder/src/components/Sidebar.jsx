import './Sidebar.css'

function Sidebar({ apps, currentApp, onSelectApp, onNewApp }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="logo-icon">🔨</span>
          <div className="logo-text">
            <span className="logo-name">Bob</span>
            <span className="logo-tagline">the Builder</span>
          </div>
        </div>
      </div>

      <div className="sidebar-content">
        <button className="new-app-btn" onClick={onNewApp}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          New App
        </button>

        <div className="sidebar-section">
          <h3 className="section-title">Your Apps</h3>
          
          {apps.length === 0 ? (
            <div className="empty-apps">
              <p>No apps yet</p>
              <p className="empty-hint">Start by describing what you want to build</p>
            </div>
          ) : (
            <div className="apps-list">
              {apps.map(app => (
                <button
                  key={app.id}
                  className={`app-item ${currentApp?.id === app.id ? 'active' : ''}`}
                  onClick={() => onSelectApp(app)}
                >
                  <span className="app-icon">
                    {getAppIcon(app.type)}
                  </span>
                  <div className="app-info">
                    <span className="app-name">{app.name}</span>
                    <span className="app-type">{formatAppType(app.type)}</span>
                  </div>
                  <span className={`app-status ${app.status}`}>
                    {app.status === 'live' ? '●' : '○'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="powered-by">
          <span>Powered by</span>
          <span className="primis-logo">Primis</span>
        </div>
        <div className="footer-links">
          <a href="#help">Help</a>
          <a href="#docs">Docs</a>
        </div>
      </div>
    </aside>
  )
}

function getAppIcon(type) {
  const icons = {
    booking: '📅',
    directory: '📋',
    waitlist: '🚀',
    portfolio: '🎨',
    store: '🛒',
    event: '🎟️',
    membership: '👥',
    internal: '🔧'
  }
  return icons[type] || '📱'
}

function formatAppType(type) {
  const labels = {
    booking: 'Booking',
    directory: 'Directory',
    waitlist: 'Waitlist',
    portfolio: 'Portfolio',
    store: 'Store',
    event: 'Event',
    membership: 'Membership',
    internal: 'Internal'
  }
  return labels[type] || type
}

export default Sidebar
