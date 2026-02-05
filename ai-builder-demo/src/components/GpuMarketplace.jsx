import { useState, useMemo } from 'react'
import './GpuMarketplace.css'

function GpuMarketplace({ instances, selectedInstance, onSelectInstance, loading }) {
  const [providerFilter, setProviderFilter] = useState('all')
  const [sortBy, setSortBy] = useState('price') // 'price', 'vram', 'name'

  const providers = useMemo(() => {
    const unique = [...new Set(instances.map(i => i.provider).filter(Boolean))]
    return ['all', ...unique]
  }, [instances])

  const filteredInstances = useMemo(() => {
    let filtered = instances
    
    // Filter by provider
    if (providerFilter !== 'all') {
      filtered = filtered.filter(i => i.provider === providerFilter)
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'price':
          return a.primisRate - b.primisRate
        case 'vram':
          return b.vram - a.vram
        case 'name':
          return a.name.localeCompare(b.name)
        default:
          return 0
      }
    })

    return filtered
  }, [instances, providerFilter, sortBy])

  const getSavings = (inst) => {
    if (!inst.marketRate || inst.marketRate === 0) return 0
    return Math.round((1 - inst.primisRate / inst.marketRate) * 100)
  }

  const totalAvailable = instances.filter(i => i.available > 0).length

  if (loading) {
    return (
      <div className="card gpu-marketplace loading">
        <div className="card-header">
          <h2 className="card-title">
            <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
              <rect x="8" y="8" width="8" height="8" rx="1"/>
              <path d="M4 9H2M4 15H2M22 9h-2M22 15h-2M9 4V2M15 4V2M9 22v-2M15 22v-2"/>
            </svg>
            GPU Marketplace
          </h2>
        </div>
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <span>Loading GPU offerings from providers...</span>
        </div>
      </div>
    )
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
          GPU Marketplace
        </h2>
        <div className="header-actions">
          <span className="availability-indicator">
            <span className="availability-dot"></span>
            {totalAvailable} GPU types available
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="marketplace-filters">
        <div className="filter-group">
          <label className="filter-label">Provider</label>
          <div className="filter-buttons">
            {providers.map(p => (
              <button
                key={p}
                className={`filter-btn ${providerFilter === p ? 'active' : ''}`}
                onClick={() => setProviderFilter(p)}
              >
                {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <label className="filter-label">Sort by</label>
          <select 
            className="sort-select" 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="price">Lowest Price</option>
            <option value="vram">Most VRAM</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {filteredInstances.length === 0 ? (
        <div className="empty-state">
          <p>No GPUs available for this filter</p>
          <button className="reset-btn" onClick={() => setProviderFilter('all')}>
            Show all providers
          </button>
        </div>
      ) : (
        <div className="instance-table">
          <div className="table-header">
            <div className="th instance-col">GPU</div>
            <div className="th provider-col">Provider</div>
            <div className="th specs-col">Specs</div>
            <div className="th price-col">Price</div>
            <div className="th action-col"></div>
          </div>

          <div className="table-body">
            {filteredInstances.map((inst, index) => (
              <div 
                key={inst.id}
                className={`table-row ${selectedInstance?.id === inst.id ? 'selected' : ''} ${!inst.available ? 'unavailable' : ''}`}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="td instance-col">
                  <div className="instance-info">
                    <span className="instance-name">{inst.name}</span>
                    {inst.region && <span className="instance-region">{inst.region}</span>}
                  </div>
                  {inst.badge && (
                    <span className={`instance-badge ${inst.badge.toLowerCase().replace(' ', '-')}`}>
                      {inst.badge}
                    </span>
                  )}
                </div>

                <div className="td provider-col">
                  <span className={`provider-tag ${inst.provider}`}>
                    {inst.provider}
                  </span>
                </div>

                <div className="td specs-col">
                  <div className="specs-grid">
                    <span className="spec-item">
                      <span className="spec-value">{inst.vram} GB</span>
                      <span className="spec-label">VRAM</span>
                    </span>
                    <span className="spec-item">
                      <span className="spec-value">{inst.vcpus}</span>
                      <span className="spec-label">vCPUs</span>
                    </span>
                  </div>
                </div>

                <div className="td price-col">
                  <div className="price-info">
                    <span className="primis-price">
                      ${inst.primisRate?.toFixed(4)}<span>/hr</span>
                    </span>
                    {inst.marketRate > inst.primisRate && (
                      <>
                        <span className="market-price">${inst.marketRate?.toFixed(4)}</span>
                        <span className="savings-tag">-{getSavings(inst)}%</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="td action-col">
                  <button 
                    className={`select-btn ${selectedInstance?.id === inst.id ? 'selected' : ''}`}
                    onClick={() => onSelectInstance(inst)}
                    disabled={!inst.available}
                  >
                    {selectedInstance?.id === inst.id ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 6L9 17L4 12"/>
                      </svg>
                    ) : !inst.available ? (
                      'Unavailable'
                    ) : (
                      'Select'
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="marketplace-footer">
        <span className="footer-note">
          Prices updated in real-time · Smart routing finds cheapest option
        </span>
        <span className="provider-count">
          {providers.length - 1} provider{providers.length - 1 !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}

export default GpuMarketplace
