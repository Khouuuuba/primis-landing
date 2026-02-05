import './Header.css'

function Header({ isLoggedIn, user, credits, onLogout, activeTab, onTabChange }) {
  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <mask id="ring">
                <circle cx="50" cy="50" r="45" fill="white"/>
                <ellipse cx="50" cy="48" rx="24" ry="20" fill="black"/>
              </mask>
            </defs>
            <circle cx="50" cy="50" r="45" fill="#F2E8DE" mask="url(#ring)"/>
          </svg>
          <span className="logo-text">Primis</span>
        </div>
        
        {isLoggedIn && (
          <nav className="header-nav">
            <button 
              className={`nav-link ${activeTab === 'agents' ? 'active' : ''}`}
              onClick={() => onTabChange('agents')}
            >
              Deployments
            </button>
            <button 
              className={`nav-link ${activeTab === 'serverless' ? 'active' : ''}`}
              onClick={() => onTabChange('serverless')}
            >
              Serverless
            </button>
            <button 
              className={`nav-link ${activeTab === 'instances' ? 'active' : ''}`}
              onClick={() => onTabChange('instances')}
            >
              Instances
            </button>
            <button 
              className={`nav-link ${activeTab === 'usage' ? 'active' : ''}`}
              onClick={() => onTabChange('usage')}
            >
              Usage
            </button>
            <button className="nav-link">Docs</button>
          </nav>
        )}
      </div>

      <div className="header-right">
        {isLoggedIn && (
          <>
            <div className="credits-display">
              <span className="credits-label">Credits</span>
              <span className="credits-amount">${credits.toFixed(2)}</span>
            </div>
            <div className="user-menu">
              <div className="user-info">
                <span className="user-org">{user.org}</span>
                <span className="user-email">{user.email}</span>
              </div>
              <button className="logout-btn" onClick={onLogout}>
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}

export default Header
