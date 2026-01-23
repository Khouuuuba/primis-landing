import './GpuMarketplace.css'

function GpuMarketplace({ instances, selectedInstance, onSelectInstance }) {
  const getSavings = (inst) => {
    return Math.round((1 - inst.primisRate / inst.marketRate) * 100)
  }

  return (
    <div className="card gpu-marketplace">
      <div className="card-header">
        <h2 className="card-title">
          <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="4" y="4" width="16" height="16" rx="2"/>
            <rect x="8" y="8" width="8" height="8" rx="1"/>
            <path d="M4 9H2M4 15H2M22 9h-2M22 15h-2M9 4V2M15 4V2M9 22v-2M15 22v-2"/>
          </svg>
          GPU Instances
        </h2>
        <div className="header-actions">
          <span className="availability-indicator">
            <span className="availability-dot"></span>
            {instances.reduce((acc, i) => acc + i.available, 0)} GPUs available
          </span>
        </div>
      </div>

      <div className="instance-table">
        <div className="table-header">
          <div className="th instance-col">Instance</div>
          <div className="th specs-col">Specs</div>
          <div className="th available-col">Available</div>
          <div className="th price-col">Price</div>
          <div className="th action-col"></div>
        </div>

        <div className="table-body">
          {instances.map((inst, index) => (
            <div 
              key={inst.id}
              className={`table-row ${selectedInstance?.id === inst.id ? 'selected' : ''}`}
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className="td instance-col">
                <div className="instance-info">
                  <span className="instance-name">{inst.name}</span>
                  <code className="instance-type">{inst.type}</code>
                </div>
                {inst.badge && (
                  <span className={`instance-badge ${inst.badge.toLowerCase().replace(' ', '-')}`}>
                    {inst.badge}
                  </span>
                )}
              </div>

              <div className="td specs-col">
                <div className="specs-grid">
                  <span className="spec-item">
                    <span className="spec-label">VRAM</span>
                    <span className="spec-value">{inst.vram} GB</span>
                  </span>
                  <span className="spec-item">
                    <span className="spec-label">vCPUs</span>
                    <span className="spec-value">{inst.vcpus}</span>
                  </span>
                  <span className="spec-item">
                    <span className="spec-label">RAM</span>
                    <span className="spec-value">{inst.ram}</span>
                  </span>
                </div>
              </div>

              <div className="td available-col">
                <span className={`available-count ${inst.available < 30 ? 'low' : ''}`}>
                  {inst.available}
                </span>
              </div>

              <div className="td price-col">
                <div className="price-info">
                  <span className="primis-price">${inst.primisRate.toFixed(2)}<span>/hr</span></span>
                  <span className="market-price">${inst.marketRate.toFixed(2)}</span>
                  <span className="savings-tag">-{getSavings(inst)}%</span>
                </div>
              </div>

              <div className="td action-col">
                <button 
                  className={`select-btn ${selectedInstance?.id === inst.id ? 'selected' : ''}`}
                  onClick={() => onSelectInstance(inst)}
                >
                  {selectedInstance?.id === inst.id ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6L9 17L4 12"/>
                    </svg>
                  ) : (
                    'Select'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default GpuMarketplace
