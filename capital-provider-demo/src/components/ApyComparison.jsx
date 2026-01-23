import './ApyComparison.css'

function ApyComparison({ effectiveApy }) {
  const regularApy = 6.8
  const improvement = ((effectiveApy - regularApy) / regularApy * 100).toFixed(1)

  return (
    <div className="apy-comparison">
      <div className="apy-header">
        <span className="apy-title">APY Comparison</span>
        <span className="apy-badge">+{improvement}% more</span>
      </div>
      
      <div className="apy-bars">
        <div className="apy-bar-item">
          <div className="apy-bar-header">
            <span className="apy-bar-label">Regular Staking</span>
            <span className="apy-bar-value dim">{regularApy}%</span>
          </div>
          <div className="apy-bar-track">
            <div 
              className="apy-bar-fill regular" 
              style={{ width: `${(regularApy / effectiveApy) * 100}%` }}
            ></div>
          </div>
        </div>
        
        <div className="apy-bar-item">
          <div className="apy-bar-header">
            <span className="apy-bar-label">With Primis</span>
            <span className="apy-bar-value highlight">{effectiveApy.toFixed(1)}%</span>
          </div>
          <div className="apy-bar-track">
            <div 
              className="apy-bar-fill primis" 
              style={{ width: '100%' }}
            ></div>
          </div>
        </div>
      </div>
      
      <div className="apy-breakdown">
        <div className="apy-breakdown-item">
          <span className="breakdown-dot regular"></span>
          <span>Base staking yield</span>
          <span className="breakdown-value">{regularApy}%</span>
        </div>
        <div className="apy-breakdown-item">
          <span className="breakdown-dot compute"></span>
          <span>Compute revenue</span>
          <span className="breakdown-value">+{(effectiveApy - regularApy).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  )
}

export default ApyComparison
