import './StatsRow.css'

function StatsRow({ portfolio }) {
  return (
    <div className="stats-row">
      <div className="stat-card">
        <div className="stat-label">Effective APY</div>
        <div className="stat-value highlight">{portfolio.effectiveApy.toFixed(1)}%</div>
        <div className="stat-sub">Staking + usage</div>
      </div>
      
      <div className="stat-card">
        <div className="stat-label">Staked</div>
        <div className="stat-value">{portfolio.stakedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} SOL</div>
        <div className="stat-sub">Principal</div>
      </div>
      
      <div className="stat-card">
        <div className="stat-label">Network Util.</div>
        <div className="stat-value">{portfolio.networkUtilization}%</div>
        <div className="stat-sub">Current epoch</div>
      </div>
    </div>
  )
}

export default StatsRow
