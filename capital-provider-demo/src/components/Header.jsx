import './Header.css'

function Header({ wallet, onDisconnect, isLoading }) {
  const truncateAddress = (address) => {
    if (!address) return ''
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  return (
    <header className="header">
      <div className="header-container">
        <div className="header-left">
          <div className="logo">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <mask id="header-ring">
                  <circle cx="50" cy="50" r="45" fill="white"/>
                  <ellipse cx="50" cy="48" rx="24" ry="20" fill="black"/>
                </mask>
              </defs>
              <circle cx="50" cy="50" r="45" fill="#F2E8DE" mask="url(#header-ring)"/>
            </svg>
          </div>
          <span className="logo-text">Primis</span>
          <span className="header-divider"></span>
          <span className="header-subtitle">Capital</span>
        </div>

        <div className="header-right">
          {wallet && (
            <div className="wallet-connected">
              <div className="wallet-balance-box">
                <span className="balance-label">Balance</span>
                <span className="wallet-balance">{wallet.balance.toFixed(4)} SOL</span>
              </div>
              <div className="wallet-info">
                <span className="wallet-address">{truncateAddress(wallet.address)}</span>
                <span className="network-badge">Devnet</span>
              </div>
              <button className="disconnect-btn" onClick={onDisconnect}>
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default Header
