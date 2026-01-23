import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import './ConnectWallet.css'

function ConnectWallet() {
  const { setVisible } = useWalletModal()

  const handleLogin = () => {
    setVisible(true)
  }

  return (
    <div className="connect-wallet-page">
      <div className="connect-content">
        <div className="connect-logo">
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <mask id="connect-ring">
                <circle cx="50" cy="50" r="45" fill="white"/>
                <ellipse cx="50" cy="48" rx="24" ry="20" fill="black"/>
              </mask>
            </defs>
            <circle cx="50" cy="50" r="45" fill="#F2E8DE" mask="url(#connect-ring)"/>
          </svg>
        </div>
        
        <h1 className="connect-title">Capital Provider Portal</h1>
        <p className="connect-subtitle">
          Stake SOL to earn base yield plus a share of AI compute revenue
        </p>

        <div className="network-notice">
          <span className="network-badge-large"></span>
          <span>Solana Devnet</span>
        </div>

        <div className="connect-features">
          <div className="feature">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                <polyline points="17 6 23 6 23 12"></polyline>
              </svg>
            </div>
            <div className="feature-text">
              <span className="feature-title">Base Yield</span>
              <span className="feature-desc">Native staking rewards preserved</span>
            </div>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="4" y="4" width="16" height="16" rx="2"></rect>
                <rect x="9" y="9" width="6" height="6"></rect>
              </svg>
            </div>
            <div className="feature-text">
              <span className="feature-title">Compute Revenue</span>
              <span className="feature-desc">Share of AI infrastructure fees</span>
            </div>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <div className="feature-text">
              <span className="feature-title">Instant Liquidity</span>
              <span className="feature-desc">Withdraw anytime, no lock-up</span>
            </div>
          </div>
        </div>

        <button className="login-btn" onClick={handleLogin}>
          Login
        </button>

        <p className="faucet-note">
          Need test SOL?{' '}
          <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer">
            Get devnet SOL
          </a>
        </p>
      </div>
    </div>
  )
}

export default ConnectWallet
