import './TrustFooter.css'

function TrustFooter() {
  return (
    <footer className="trust-footer">
      <div className="trust-footer-inner">
        <div className="trust-items">
          <div className="trust-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <polyline points="9 12 11 14 15 10"></polyline>
            </svg>
            <span>Audited</span>
          </div>
          <div className="trust-divider"></div>
          <div className="trust-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>99.9% Uptime</span>
          </div>
          <div className="trust-divider"></div>
          <div className="trust-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <span>Solana Native</span>
          </div>
        </div>
        <div className="trust-version">
          <span>Primis Protocol</span>
          <span className="version-badge">v1.0.0</span>
        </div>
      </div>
    </footer>
  )
}

export default TrustFooter
