import { useState, useEffect, useMemo } from 'react'
import './JobConfigurator.css'

const WORKLOAD_TYPES = [
  { id: 'training', name: 'Training', icon: '⚡', desc: 'Model training & pre-training' },
  { id: 'fine-tuning', name: 'Fine-tuning', icon: '🎯', desc: 'LoRA, QLoRA, full fine-tune' },
  { id: 'inference', name: 'Inference', icon: '🚀', desc: 'Batch inference & evaluation' },
  { id: 'other', name: 'Other', icon: '🔧', desc: 'Custom workloads' }
]

function JobConfigurator({ selectedInstance, credits, onSubmit, onClear }) {
  const [count, setCount] = useState(1)
  const [hours, setHours] = useState(1)
  const [workload, setWorkload] = useState('training')
  const [jobName, setJobName] = useState('')

  useEffect(() => {
    setCount(1)
    setHours(1)
    setJobName('')
  }, [selectedInstance?.id])

  const pricing = useMemo(() => {
    if (!selectedInstance) return null
    
    const subtotal = selectedInstance.primisRate * count * hours
    const marketTotal = selectedInstance.marketRate * count * hours
    const savings = marketTotal - subtotal
    const savingsPercent = Math.round((savings / marketTotal) * 100)

    return {
      subtotal,
      marketTotal,
      savings,
      savingsPercent,
      canAfford: subtotal <= credits
    }
  }, [selectedInstance, count, hours, credits])

  const handleSubmit = () => {
    if (!selectedInstance || !pricing?.canAfford) return
    onSubmit({ instance: selectedInstance, count, hours, workload, jobName })
  }

  if (!selectedInstance) {
    return (
      <div className="card job-configurator empty-state">
        <div className="empty-content">
          <div className="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </div>
          <h3>Launch Instance</h3>
          <p>Select a GPU instance from the table to configure and launch your job</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card job-configurator">
      <div className="config-header">
        <h2 className="config-title">Launch Instance</h2>
        <button className="clear-btn" onClick={onClear}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className="selected-instance">
        <div className="instance-header">
          <span className="instance-name">{selectedInstance.name}</span>
          <span className="instance-rate">${selectedInstance.primisRate}/hr</span>
        </div>
        <code className="instance-type">{selectedInstance.type}</code>
      </div>

      {/* Job Name */}
      <div className="config-field">
        <label className="field-label">Job Name <span className="optional">(optional)</span></label>
        <input
          type="text"
          className="text-input"
          placeholder="e.g., llama-finetune-v2"
          value={jobName}
          onChange={(e) => setJobName(e.target.value)}
        />
      </div>

      {/* Workload Type */}
      <div className="config-field">
        <label className="field-label">Workload Type</label>
        <div className="workload-grid">
          {WORKLOAD_TYPES.map(w => (
            <button
              key={w.id}
              className={`workload-btn ${workload === w.id ? 'active' : ''}`}
              onClick={() => setWorkload(w.id)}
            >
              <span className="workload-name">{w.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* GPU Count */}
      <div className="config-field">
        <label className="field-label">Number of GPUs</label>
        <div className="count-selector">
          <button 
            className="count-btn"
            onClick={() => setCount(Math.max(1, count - 1))}
            disabled={count <= 1}
          >-</button>
          <span className="count-value">{count}</span>
          <button 
            className="count-btn"
            onClick={() => setCount(Math.min(8, count + 1))}
            disabled={count >= 8}
          >+</button>
        </div>
        <span className="field-hint">{selectedInstance.available} available · Max 8 per job</span>
      </div>

      {/* Duration */}
      <div className="config-field">
        <label className="field-label">Duration</label>
        <div className="duration-presets">
          {[1, 4, 8, 24].map(h => (
            <button
              key={h}
              className={`preset-btn ${hours === h ? 'active' : ''}`}
              onClick={() => setHours(h)}
            >
              {h}h
            </button>
          ))}
        </div>
        <div className="duration-custom">
          <input
            type="range"
            min="1"
            max="72"
            value={hours}
            onChange={(e) => setHours(parseInt(e.target.value))}
            className="range-slider"
          />
          <span className="duration-display">{hours} hour{hours !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Cost Summary */}
      <div className="cost-summary">
        <div className="cost-row">
          <span className="cost-label">Estimated cost</span>
          <span className="cost-value">${pricing.subtotal.toFixed(2)}</span>
        </div>
        <div className="cost-row savings">
          <span className="cost-label">vs. market rate</span>
          <span className="cost-value">-${pricing.savings.toFixed(2)} ({pricing.savingsPercent}% off)</span>
        </div>
        <div className="cost-row total">
          <span className="cost-label">You pay</span>
          <span className="cost-value">${pricing.subtotal.toFixed(2)}</span>
        </div>
      </div>

      <button
        className={`launch-btn ${!pricing.canAfford ? 'disabled' : ''}`}
        onClick={handleSubmit}
        disabled={!pricing.canAfford}
      >
        {pricing.canAfford ? (
          <>
            Launch Instance
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </>
        ) : (
          'Insufficient Credits'
        )}
      </button>

      {!pricing.canAfford && (
        <p className="credits-warning">
          Add ${(pricing.subtotal - credits).toFixed(2)} in credits to continue
        </p>
      )}

      <p className="billing-note">
        Billed per second · Cancel anytime
      </p>
    </div>
  )
}

export default JobConfigurator
