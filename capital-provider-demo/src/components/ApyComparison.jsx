import { useState, useEffect } from 'react'
import './ApyComparison.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function ApyComparison({ userStakeSOL = 0, hasDeposit = false }) {
  const [apyData, setApyData] = useState(null)
  const [revenueModel, setRevenueModel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastValidStake, setLastValidStake] = useState(0)
  
  // Track last valid stake to prevent 0 flicker during refreshes
  useEffect(() => {
    if (userStakeSOL > 0) {
      setLastValidStake(userStakeSOL)
    }
  }, [userStakeSOL])
  
  // Use last valid stake or current stake
  const effectiveStake = userStakeSOL > 0 ? userStakeSOL : lastValidStake
  
  // Fetch variable APY from API
  useEffect(() => {
    const fetchAPY = async () => {
      try {
        // Fetch revenue model
        const modelRes = await fetch(`${API_URL}/api/yield/revenue-model`)
        const modelData = await modelRes.json()
        if (modelData.success) {
          setRevenueModel(modelData.model)
        }
        
        // Fetch user's APY based on stake (use effectiveStake to prevent 0)
        const stakeToQuery = effectiveStake > 0 ? effectiveStake : userStakeSOL
        if (stakeToQuery > 0) {
          const apyRes = await fetch(`${API_URL}/api/yield/apy/${stakeToQuery}`)
          const apyResult = await apyRes.json()
          if (apyResult.success) {
            setApyData(apyResult.apy)
          }
        }
      } catch (error) {
        console.error('Failed to fetch APY data:', error)
        // Don't clear apyData on error - keep showing last valid data
      } finally {
        setLoading(false)
      }
    }
    
    fetchAPY()
    // Refresh every 60 seconds
    const interval = setInterval(fetchAPY, 60000)
    return () => clearInterval(interval)
  }, [effectiveStake, userStakeSOL])

  // Calculate display values
  const regularApy = 6.33 // Base Solana staking yield for comparison
  const effectiveAPY = apyData ? parseFloat(apyData.effectiveAPY) : 0
  const stakePercent = apyData ? parseFloat(apyData.stakePercent) : 0
  
  // Cap display APY at 1000% for visual purposes (but show real value in tooltip)
  const displayAPY = Math.min(effectiveAPY, 1000)
  const isApyCapped = effectiveAPY > 1000
  
  // Format large numbers
  const formatAPY = (apy) => {
    if (apy >= 1000) return `${(apy / 1000).toFixed(1)}K%`
    if (apy >= 100) return `${apy.toFixed(0)}%`
    return `${apy.toFixed(1)}%`
  }

  return (
    <div className="apy-comparison">
      <div className="apy-header">
        <span className="apy-title">Your Variable APY</span>
        {hasDeposit && effectiveAPY > regularApy && (
          <span className="apy-badge variable">
            {effectiveAPY > 100 ? '🔥 Early Staker Bonus' : `+${((effectiveAPY / regularApy - 1) * 100).toFixed(0)}%`}
          </span>
        )}
      </div>
      
      {!hasDeposit ? (
        <div className="apy-empty">
          <span className="apy-empty-text">Deposit SOL to see your personalized APY</span>
          <span className="apy-empty-hint">APY varies based on your stake % of TVL</span>
        </div>
      ) : loading ? (
        <div className="apy-loading">Calculating...</div>
      ) : (
        <>
          <div className="apy-bars">
            <div className="apy-bar-item">
              <div className="apy-bar-header">
                <span className="apy-bar-label">Regular Staking</span>
                <span className="apy-bar-value dim">{regularApy}%</span>
              </div>
              <div className="apy-bar-track">
                <div 
                  className="apy-bar-fill regular" 
                  style={{ width: `${Math.min((regularApy / displayAPY) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
            
            <div className="apy-bar-item">
              <div className="apy-bar-header">
                <span className="apy-bar-label">Your Primis APY</span>
                <span className="apy-bar-value highlight" title={`Actual: ${effectiveAPY.toFixed(2)}%`}>
                  {formatAPY(effectiveAPY)}
                  {isApyCapped && ' 🚀'}
                </span>
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
              <span>Your stake</span>
              <span className="breakdown-value">{stakePercent}% of TVL</span>
            </div>
            <div className="apy-breakdown-item">
              <span className="breakdown-dot compute"></span>
              <span>Your share of revenue</span>
              <span className="breakdown-value">{stakePercent}%</span>
            </div>
          </div>
          
          {revenueModel && (
            <div className="revenue-model-info">
              <div className="model-row">
                <span>Yearly compute volume</span>
                <span>${(revenueModel.yearlyComputeVolumeUSD / 1_000_000).toFixed(0)}M</span>
              </div>
              <div className="model-row">
                <span>Primis fee</span>
                <span>{revenueModel.primisFeePercent}%</span>
              </div>
              <div className="model-row">
                <span>Your share of fees</span>
                <span>{revenueModel.stakerSharePercent}%</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ApyComparison
