import { useState, useEffect, useMemo } from 'react'
import './LaunchConfigurator.css'

const DEFAULT_TEMPLATES = [
  { id: 'pytorch-2.0', name: 'PyTorch 2.0', desc: 'JupyterLab + PyTorch + CUDA', category: 'ml' },
  { id: 'stable-diffusion', name: 'Stable Diffusion', desc: 'AUTOMATIC1111 WebUI', category: 'image' },
  { id: 'text-generation', name: 'Text Gen WebUI', desc: 'Oobabooga LLM inference', category: 'llm' },
  { id: 'comfyui', name: 'ComfyUI', desc: 'Node-based image gen', category: 'image' },
  { id: 'jupyter-minimal', name: 'Jupyter Minimal', desc: 'Clean notebook environment', category: 'development' }
]

function LaunchConfigurator({ selectedGpu, templates, credits, onLaunch, onClear, backendConnected }) {
  const [instanceName, setInstanceName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('pytorch-2.0')
  const [volumeSize, setVolumeSize] = useState(20)

  const displayTemplates = templates?.length > 0 ? templates : DEFAULT_TEMPLATES

  useEffect(() => {
    setInstanceName('')
    setSelectedTemplate('pytorch-2.0')
    setVolumeSize(20)
  }, [selectedGpu?.id])

  const pricing = useMemo(() => {
    if (!selectedGpu) return null
    
    const hourlyRate = selectedGpu.primisRate
    const marketRate = selectedGpu.marketRate
    const savingsPercent = Math.round((1 - hourlyRate / marketRate) * 100)

    return {
      hourlyRate,
      marketRate,
      savingsPercent,
      canAfford: hourlyRate <= credits // Need at least 1 hour of credits
    }
  }, [selectedGpu, credits])

  const handleLaunch = () => {
    if (!selectedGpu || !pricing?.canAfford) return
    onLaunch({
      gpu: selectedGpu,
      templateId: selectedTemplate,
      name: instanceName || undefined,
      volumeSize
    })
  }

  if (!selectedGpu) {
    return (
      <div className="card launch-configurator empty-state">
        <div className="empty-content">
          <div className="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
              <path d="M9 9h6v6H9z"/>
              <circle cx="12" cy="12" r="2"/>
            </svg>
          </div>
          <h3>Launch GPU Instance</h3>
          <p>Select a GPU from the marketplace to configure and launch</p>
          {!backendConnected && (
            <div className="connection-warning">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>Backend not connected. Running in demo mode.</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="card launch-configurator">
      <div className="config-header">
        <h2 className="config-title">Launch Instance</h2>
        <button className="clear-btn" onClick={onClear} title="Clear selection">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Selected GPU */}
      <div className="selected-gpu">
        <div className="gpu-header">
          <span className="gpu-name">{selectedGpu.name}</span>
          <span className="provider-badge">{selectedGpu.provider}</span>
        </div>
        <div className="gpu-specs">
          <span>{selectedGpu.vram} GB VRAM</span>
          <span className="spec-sep">·</span>
          <span>{selectedGpu.region || 'Global'}</span>
        </div>
        <div className="gpu-pricing">
          <span className="primis-rate">${selectedGpu.primisRate?.toFixed(4)}/hr</span>
          <span className="market-rate">${selectedGpu.marketRate?.toFixed(4)}</span>
          <span className="savings-badge">-{pricing?.savingsPercent}%</span>
        </div>
      </div>

      {/* Instance Name */}
      <div className="config-field">
        <label className="field-label">Instance Name <span className="optional">(optional)</span></label>
        <input
          type="text"
          className="text-input"
          placeholder={`${selectedGpu.name?.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString(36).slice(-4)}`}
          value={instanceName}
          onChange={(e) => setInstanceName(e.target.value)}
        />
      </div>

      {/* Template Selection */}
      <div className="config-field">
        <label className="field-label">Environment Template</label>
        <div className="template-list">
          {displayTemplates.map(t => (
            <button
              key={t.id}
              className={`template-btn ${selectedTemplate === t.id ? 'active' : ''}`}
              onClick={() => setSelectedTemplate(t.id)}
            >
              <span className="template-name">{t.name}</span>
              <span className="template-desc">{t.desc || t.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Volume Size */}
      <div className="config-field">
        <label className="field-label">Storage Volume</label>
        <div className="volume-selector">
          {[20, 50, 100, 200].map(size => (
            <button
              key={size}
              className={`volume-btn ${volumeSize === size ? 'active' : ''}`}
              onClick={() => setVolumeSize(size)}
            >
              {size} GB
            </button>
          ))}
        </div>
        <span className="field-hint">Persistent storage mounted at /workspace</span>
      </div>

      {/* Pricing Info */}
      <div className="pricing-info">
        <div className="price-row">
          <span className="price-label">Hourly rate</span>
          <span className="price-value">${pricing?.hourlyRate?.toFixed(4)}/hr</span>
        </div>
        <div className="price-row savings">
          <span className="price-label">vs. {selectedGpu.provider || 'market'}</span>
          <span className="price-value">Save {pricing?.savingsPercent}%</span>
        </div>
        <div className="price-row highlight">
          <span className="price-label">Billing</span>
          <span className="price-value">Per second · Stop anytime</span>
        </div>
      </div>

      {/* Launch Button */}
      <button
        className={`launch-btn ${!pricing?.canAfford ? 'disabled' : ''}`}
        onClick={handleLaunch}
        disabled={!pricing?.canAfford || !backendConnected}
      >
        {!backendConnected ? (
          'Backend Not Connected'
        ) : pricing?.canAfford ? (
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

      {!pricing?.canAfford && backendConnected && (
        <p className="credits-warning">
          Need at least ${pricing?.hourlyRate?.toFixed(2)} to launch (1 hour minimum)
        </p>
      )}

      <div className="launch-info">
        <div className="info-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12,6 12,12 16,14"/>
          </svg>
          <span>Usually ready in 1-2 minutes</span>
        </div>
        <div className="info-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span>SSH & Jupyter access included</span>
        </div>
      </div>
    </div>
  )
}

export default LaunchConfigurator
