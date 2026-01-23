import './ConnectWallet.css'

function ConnectWallet({ onLogin }) {
  return (
    <div className="login-page">
      <div className="login-content">
        <div className="login-header">
          <svg className="login-logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <mask id="ring-login">
                <circle cx="50" cy="50" r="45" fill="white"/>
                <ellipse cx="50" cy="48" rx="24" ry="20" fill="black"/>
              </mask>
            </defs>
            <circle cx="50" cy="50" r="45" fill="#F2E8DE" mask="url(#ring-login)"/>
          </svg>
          <h1 className="login-title">Primis Compute</h1>
          <p className="login-subtitle">GPU cloud for AI workloads at 30% less</p>
        </div>

        <div className="login-features">
          <div className="login-feature">
            <div className="feature-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17L4 12"/>
              </svg>
            </div>
            <div className="feature-content">
              <span className="feature-title">Pay-as-you-go</span>
              <span className="feature-desc">No commitments, billed per second</span>
            </div>
          </div>

          <div className="login-feature">
            <div className="feature-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17L4 12"/>
              </svg>
            </div>
            <div className="feature-content">
              <span className="feature-title">Instant availability</span>
              <span className="feature-desc">A100, H100, L40S ready to deploy</span>
            </div>
          </div>

          <div className="login-feature">
            <div className="feature-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17L4 12"/>
              </svg>
            </div>
            <div className="feature-content">
              <span className="feature-title">Simple API</span>
              <span className="feature-desc">One line to launch, works with your stack</span>
            </div>
          </div>
        </div>

        <div className="login-actions">
          <button 
            className="login-btn primary"
            onClick={onLogin}
          >
            Sign In
          </button>
          <button 
            className="login-btn secondary"
            onClick={onLogin}
          >
            Create Account
          </button>
        </div>

        <p className="login-footer">
          Sign in with email or Google
        </p>
      </div>

      <div className="login-side">
        <div className="code-preview">
          <div className="code-header">
            <span className="code-dot"></span>
            <span className="code-dot"></span>
            <span className="code-dot"></span>
            <span className="code-filename">launch.py</span>
          </div>
          <pre className="code-content">
<span className="code-keyword">from</span> primis <span className="code-keyword">import</span> Compute{'\n'}
{'\n'}
<span className="code-comment"># Launch 4x H100 for training</span>{'\n'}
job = Compute.run({'\n'}
    <span className="code-string">"gpu"</span>: <span className="code-string">"h100"</span>,{'\n'}
    <span className="code-string">"count"</span>: <span className="code-number">4</span>,{'\n'}
    <span className="code-string">"command"</span>: <span className="code-string">"python train.py"</span>{'\n'}
){'\n'}
{'\n'}
<span className="code-keyword">print</span>(job.status)  <span className="code-comment"># running</span>{'\n'}
<span className="code-keyword">print</span>(job.cost)    <span className="code-comment"># $23.12/hr</span>
          </pre>
        </div>
      </div>
    </div>
  )
}

export default ConnectWallet
