import { useState, useEffect } from 'react'
import './ApiKeysPanel.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function ApiKeysPanel({ privyId, showToast }) {
  const [apiKeys, setApiKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyScopes, setNewKeyScopes] = useState(['read'])
  const [newKeyExpiry, setNewKeyExpiry] = useState('')
  const [newlyCreatedKey, setNewlyCreatedKey] = useState(null)
  const [copiedKeyId, setCopiedKeyId] = useState(null)

  // Fetch API keys on mount
  useEffect(() => {
    fetchApiKeys()
  }, [privyId])

  const fetchApiKeys = async () => {
    try {
      const res = await fetch(`${API_URL}/api/api-keys`, {
        headers: { 'x-privy-id': privyId }
      })
      const data = await res.json()
      if (data.success) {
        setApiKeys(data.keys)
      }
    } catch (error) {
      console.error('Error fetching API keys:', error)
      showToast?.('Failed to load API keys', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      showToast?.('Please enter a key name', 'error')
      return
    }

    setCreating(true)
    try {
      const res = await fetch(`${API_URL}/api/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-privy-id': privyId
        },
        body: JSON.stringify({
          name: newKeyName.trim(),
          scopes: newKeyScopes,
          expiresIn: newKeyExpiry || null
        })
      })
      const data = await res.json()
      
      if (data.success) {
        setNewlyCreatedKey(data.key)
        setShowCreateModal(false)
        setNewKeyName('')
        setNewKeyScopes(['read'])
        setNewKeyExpiry('')
        fetchApiKeys()
        showToast?.('API key created successfully', 'success')
      } else {
        showToast?.(data.error || 'Failed to create key', 'error')
      }
    } catch (error) {
      console.error('Error creating API key:', error)
      showToast?.('Failed to create API key', 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleRevokeKey = async (keyId, keyPrefix) => {
    if (!confirm(`Are you sure you want to revoke key "${keyPrefix}..."? This cannot be undone.`)) {
      return
    }

    try {
      const res = await fetch(`${API_URL}/api/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: { 'x-privy-id': privyId }
      })
      const data = await res.json()
      
      if (data.success) {
        fetchApiKeys()
        showToast?.('API key revoked', 'success')
      } else {
        showToast?.(data.error || 'Failed to revoke key', 'error')
      }
    } catch (error) {
      console.error('Error revoking API key:', error)
      showToast?.('Failed to revoke API key', 'error')
    }
  }

  const copyToClipboard = async (text, keyId) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKeyId(keyId)
      showToast?.('Copied to clipboard', 'success')
      setTimeout(() => setCopiedKeyId(null), 2000)
    } catch (error) {
      showToast?.('Failed to copy', 'error')
    }
  }

  const toggleScope = (scope) => {
    setNewKeyScopes(prev => 
      prev.includes(scope) 
        ? prev.filter(s => s !== scope)
        : [...prev, scope]
    )
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="api-keys-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="header-content">
          <h1>API Keys</h1>
          <p>Manage programmatic access to the Primis API</p>
        </div>
        <button className="create-btn" onClick={() => setShowCreateModal(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Create New Key
        </button>
      </div>

      {/* Newly Created Key Banner */}
      {newlyCreatedKey && (
        <div className="new-key-banner">
          <div className="banner-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>Your new API key</span>
          </div>
          <p className="banner-warning">
            ⚠️ Copy this key now. It won't be shown again.
          </p>
          <div className="key-display">
            <code>{newlyCreatedKey.fullKey}</code>
            <button 
              className="copy-btn"
              onClick={() => copyToClipboard(newlyCreatedKey.fullKey, 'new')}
            >
              {copiedKeyId === 'new' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              )}
            </button>
          </div>
          <button className="dismiss-btn" onClick={() => setNewlyCreatedKey(null)}>
            I've saved my key
          </button>
        </div>
      )}

      {/* API Keys List */}
      <div className="keys-section">
        <div className="section-header">
          <h2>Your API Keys</h2>
          <span className="key-count">{apiKeys.filter(k => k.is_active).length} active</span>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p>Loading API keys...</p>
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
            </svg>
            <h3>No API Keys</h3>
            <p>Create your first API key to start using the Primis API programmatically.</p>
            <button className="create-btn secondary" onClick={() => setShowCreateModal(true)}>
              Create Your First Key
            </button>
          </div>
        ) : (
          <div className="keys-list">
            {apiKeys.map(key => (
              <div key={key.id} className={`key-card ${!key.is_active ? 'revoked' : ''}`}>
                <div className="key-main">
                  <div className="key-info">
                    <div className="key-name">{key.name}</div>
                    <div className="key-prefix">
                      <code>{key.prefix}...</code>
                      <button 
                        className="copy-small"
                        onClick={() => copyToClipboard(key.prefix, key.id)}
                        title="Copy prefix"
                      >
                        {copiedKeyId === key.id ? '✓' : '⎘'}
                      </button>
                    </div>
                  </div>
                  <div className="key-scopes">
                    {key.scopes.map(scope => (
                      <span key={scope} className={`scope-badge ${scope}`}>
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="key-meta">
                  <div className="meta-item">
                    <span className="meta-label">Created</span>
                    <span className="meta-value">{formatDate(key.created_at)}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Last Used</span>
                    <span className="meta-value">{formatDate(key.last_used_at)}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Requests</span>
                    <span className="meta-value">{key.request_count?.toLocaleString() || 0}</span>
                  </div>
                  {key.expires_at && (
                    <div className="meta-item">
                      <span className="meta-label">Expires</span>
                      <span className="meta-value">{formatDate(key.expires_at)}</span>
                    </div>
                  )}
                </div>
                <div className="key-actions">
                  {key.is_active ? (
                    <button 
                      className="revoke-btn"
                      onClick={() => handleRevokeKey(key.id, key.prefix)}
                    >
                      Revoke
                    </button>
                  ) : (
                    <span className="revoked-badge">Revoked</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage Example */}
      <div className="usage-section">
        <h2>Quick Start</h2>
        <div className="code-example">
          <div className="code-header">
            <span>cURL</span>
          </div>
          <pre><code>{`curl -X POST ${API_URL}/api/batch/estimate \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "A futuristic city"}'`}</code></pre>
        </div>
        <div className="code-example">
          <div className="code-header">
            <span>JavaScript</span>
          </div>
          <pre><code>{`const response = await fetch('${API_URL}/api/batch/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: 'A futuristic city',
    numImages: 1
  })
});`}</code></pre>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create API Key</h2>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Key Name</label>
                <input
                  type="text"
                  placeholder="e.g., Production Server"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  maxLength={100}
                />
                <span className="hint">A friendly name to identify this key</span>
              </div>

              <div className="form-group">
                <label>Permissions</label>
                <div className="scope-options">
                  <label className={`scope-option ${newKeyScopes.includes('read') ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={newKeyScopes.includes('read')}
                      onChange={() => toggleScope('read')}
                    />
                    <div className="scope-info">
                      <span className="scope-name">Read</span>
                      <span className="scope-desc">View jobs, files, and account data</span>
                    </div>
                  </label>
                  <label className={`scope-option ${newKeyScopes.includes('write') ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={newKeyScopes.includes('write')}
                      onChange={() => toggleScope('write')}
                    />
                    <div className="scope-info">
                      <span className="scope-name">Write</span>
                      <span className="scope-desc">Create jobs, upload files, manage instances</span>
                    </div>
                  </label>
                  <label className={`scope-option ${newKeyScopes.includes('admin') ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={newKeyScopes.includes('admin')}
                      onChange={() => toggleScope('admin')}
                    />
                    <div className="scope-info">
                      <span className="scope-name">Admin</span>
                      <span className="scope-desc">Full access including billing and API keys</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>Expiration (Optional)</label>
                <select value={newKeyExpiry} onChange={(e) => setNewKeyExpiry(e.target.value)}>
                  <option value="">Never expires</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="365">1 year</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button 
                className="create-btn" 
                onClick={handleCreateKey}
                disabled={creating || !newKeyName.trim()}
              >
                {creating ? 'Creating...' : 'Create Key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ApiKeysPanel
