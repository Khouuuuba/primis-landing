import { useState, useEffect, useCallback } from 'react';
import './AgentsPanel.css';

const API_URL = (() => {
  const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  return rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;
})();

// Framework icons/badges
const FRAMEWORK_CONFIG = {
  langchain: { label: 'LangChain', color: '#1C3C3C' },
  crewai: { label: 'CrewAI', color: '#6366F1' },
  autogen: { label: 'AutoGen', color: '#0078D4' },
  langgraph: { label: 'LangGraph', color: '#10B981' },
  eliza: { label: 'ELIZA', color: '#EC4899' },
  custom: { label: 'Custom', color: '#6B7280' }
};

const STATUS_CONFIG = {
  draft: { label: 'Draft', color: '#6B7280', dot: '#9CA3AF' },
  deploying: { label: 'Deploying', color: '#F59E0B', dot: '#FBBF24' },
  running: { label: 'Running', color: '#10B981', dot: '#34D399' },
  stopped: { label: 'Stopped', color: '#6B7280', dot: '#9CA3AF' },
  failed: { label: 'Failed', color: '#EF4444', dot: '#F87171' }
};

function AgentsPanel({ user, credits, showToast }) {
  const [agents, setAgents] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [summary, setSummary] = useState({ running_count: 0, total_count: 0, total_cost: 0, total_runs: 0 });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list', 'create', 'detail'
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    framework: 'custom',
    runtime: 'python',
    entry_point: 'main.py',
    template_id: null
  });
  const [uploading, setUploading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [invokeInput, setInvokeInput] = useState('');
  const [invokeResponse, setInvokeResponse] = useState(null);
  const [invoking, setInvoking] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState(null);

  // Fetch agents
  const fetchAgents = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const response = await fetch(`${API_URL}/agents`, {
        headers: { 'x-privy-id': user.id }
      });
      
      if (!response.ok) throw new Error('Failed to fetch agents');
      
      const data = await response.json();
      setAgents(data.agents || []);
      setSummary(data.summary || { running_count: 0, total_count: 0, total_cost: 0, total_runs: 0 });
    } catch (error) {
      console.error('Error fetching agents:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/agents/templates`);
      if (!response.ok) throw new Error('Failed to fetch templates');
      
      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    fetchTemplates();
  }, [fetchAgents, fetchTemplates]);

  // Auto-refresh when agents are deploying
  useEffect(() => {
    const hasDeploying = agents.some(a => a.status === 'deploying');
    if (hasDeploying) {
      const interval = setInterval(fetchAgents, 3000);
      return () => clearInterval(interval);
    }
  }, [agents, fetchAgents]);

  // Create agent
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim()) {
      showToast?.('Agent name is required', 'error');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-privy-id': user.id
        },
        body: JSON.stringify(createForm)
      });

      if (!response.ok) throw new Error('Failed to create agent');

      const data = await response.json();
      showToast?.('Agent created successfully', 'success');
      setAgents(prev => [data.agent, ...prev]);
      setSelectedAgent(data.agent);
      setView('detail');
      setCreateForm({
        name: '',
        description: '',
        framework: 'custom',
        runtime: 'python',
        entry_point: 'main.py',
        template_id: null
      });
    } catch (error) {
      console.error('Error creating agent:', error);
      showToast?.('Failed to create agent', 'error');
    }
  };

  // Upload code
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAgent) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('code', file);

      const response = await fetch(`${API_URL}/agents/${selectedAgent.id}/upload`, {
        method: 'POST',
        headers: { 'x-privy-id': user.id },
        body: formData
      });

      if (!response.ok) throw new Error('Failed to upload code');

      const data = await response.json();
      showToast?.('Code uploaded successfully', 'success');
      
      // Update agent in state
      setSelectedAgent(prev => ({ ...prev, code_url: data.code_url, status: 'draft' }));
      setAgents(prev => prev.map(a => 
        a.id === selectedAgent.id ? { ...a, code_url: data.code_url, status: 'draft' } : a
      ));
    } catch (error) {
      console.error('Error uploading code:', error);
      showToast?.('Failed to upload code', 'error');
    } finally {
      setUploading(false);
    }
  };

  // Deploy agent
  const handleDeploy = async () => {
    if (!selectedAgent) return;

    setDeploying(true);
    try {
      const response = await fetch(`${API_URL}/agents/${selectedAgent.id}/deploy`, {
        method: 'POST',
        headers: { 'x-privy-id': user.id }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to deploy agent');
      }

      showToast?.('Deployment started', 'success');
      
      // Update agent status
      setSelectedAgent(prev => ({ ...prev, status: 'deploying' }));
      setAgents(prev => prev.map(a => 
        a.id === selectedAgent.id ? { ...a, status: 'deploying' } : a
      ));
    } catch (error) {
      console.error('Error deploying agent:', error);
      showToast?.(error.message, 'error');
    } finally {
      setDeploying(false);
    }
  };

  // Stop/Start agent
  const handleToggleAgent = async (action) => {
    if (!selectedAgent) return;

    try {
      const response = await fetch(`${API_URL}/agents/${selectedAgent.id}/${action}`, {
        method: 'POST',
        headers: { 'x-privy-id': user.id }
      });

      if (!response.ok) throw new Error(`Failed to ${action} agent`);

      const newStatus = action === 'start' ? 'running' : 'stopped';
      showToast?.(`Agent ${action}ed`, 'success');
      
      setSelectedAgent(prev => ({ ...prev, status: newStatus }));
      setAgents(prev => prev.map(a => 
        a.id === selectedAgent.id ? { ...a, status: newStatus } : a
      ));
      fetchAgents();
    } catch (error) {
      console.error(`Error ${action}ing agent:`, error);
      showToast?.(`Failed to ${action} agent`, 'error');
    }
  };

  // Delete agent
  const handleDelete = async () => {
    if (!selectedAgent) return;
    if (!confirm(`Delete agent "${selectedAgent.name}"? This cannot be undone.`)) return;

    try {
      const response = await fetch(`${API_URL}/agents/${selectedAgent.id}`, {
        method: 'DELETE',
        headers: { 'x-privy-id': user.id }
      });

      if (!response.ok) throw new Error('Failed to delete agent');

      showToast?.('Agent deleted', 'success');
      setAgents(prev => prev.filter(a => a.id !== selectedAgent.id));
      setSelectedAgent(null);
      setView('list');
    } catch (error) {
      console.error('Error deleting agent:', error);
      showToast?.('Failed to delete agent', 'error');
    }
  };

  // Invoke agent
  const handleInvoke = async () => {
    if (!selectedAgent || !invokeInput.trim()) return;

    setInvoking(true);
    setInvokeResponse(null);

    try {
      const response = await fetch(`${API_URL}/agents/${selectedAgent.id}/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-privy-id': user.id
        },
        body: JSON.stringify({
          input: invokeInput,
          sync: true
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to invoke agent');
      }

      setInvokeResponse(data);
      showToast?.('Agent invoked successfully', 'success');
      fetchAgents(); // Refresh to update stats
    } catch (error) {
      console.error('Error invoking agent:', error);
      setInvokeResponse({ error: error.message });
      showToast?.(error.message, 'error');
    } finally {
      setInvoking(false);
    }
  };

  // Generate webhook
  const handleGenerateWebhook = async () => {
    if (!selectedAgent) return;

    try {
      const response = await fetch(`${API_URL}/agents/${selectedAgent.id}/generate-webhook`, {
        method: 'POST',
        headers: { 'x-privy-id': user.id }
      });

      if (!response.ok) throw new Error('Failed to generate webhook');

      const data = await response.json();
      setWebhookInfo(data);
      showToast?.('Webhook generated', 'success');
    } catch (error) {
      console.error('Error generating webhook:', error);
      showToast?.('Failed to generate webhook', 'error');
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showToast?.('Copied to clipboard', 'success');
  };

  // Select template for creation
  const selectTemplate = (template) => {
    setCreateForm({
      name: `My ${template.name}`,
      description: template.description,
      framework: template.framework,
      runtime: template.runtime,
      entry_point: template.entry_point,
      template_id: template.id
    });
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="agents-panel">
        <div className="agents-loading">
          <div className="loading-spinner"></div>
          <p>Loading agents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="agents-panel">
      {/* Header */}
      <div className="agents-header">
        <div className="agents-header-left">
          <h1>Deployments</h1>
          <p className="agents-subtitle">Deploy and run your code on GPU</p>
        </div>
        <div className="agents-header-right">
          <div className="agents-stats">
            <span className="stat">Running · {summary.running_count || 0}</span>
            <span className="stat-divider">|</span>
            <span className="stat">Total · {summary.total_count || 0}</span>
          </div>
          {view !== 'create' && (
            <button className="create-agent-btn" onClick={() => setView('create')}>
              New Deployment
            </button>
          )}
        </div>
      </div>

      {/* View Navigation */}
      {view !== 'create' && (
        <div className="agents-nav">
          <button 
            className={`nav-btn ${view === 'list' ? 'active' : ''}`}
            onClick={() => { setView('list'); setSelectedAgent(null); }}
          >
            All Deployments
          </button>
          {selectedAgent && (
            <button 
              className={`nav-btn ${view === 'detail' ? 'active' : ''}`}
              onClick={() => setView('detail')}
            >
              {selectedAgent.name}
            </button>
          )}
        </div>
      )}

      {/* Create View */}
      {view === 'create' && (
        <div className="agents-create">
          <div className="create-header">
            <h2>New Deployment</h2>
            <button className="back-btn" onClick={() => setView('list')}>
              Back
            </button>
          </div>

          <p className="create-subtitle">
            Deploy your code to run on GPU. Upload a ZIP file with your Python or Node.js project.
          </p>

          {/* Simplified Create Form */}
          <form className="create-form" onSubmit={handleCreate}>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="my-project"
                required
              />
            </div>

            <div className="form-group">
              <label>Description (optional)</label>
              <textarea
                value={createForm.description}
                onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="What does this deployment do?"
                rows={2}
              />
            </div>

            <div className="form-actions">
              <button type="button" className="cancel-btn" onClick={() => setView('list')}>
                Cancel
              </button>
              <button type="submit" className="submit-btn">
                Create
              </button>
            </div>
          </form>

          <div className="create-info">
            <p>After creating, you'll upload your code and deploy.</p>
          </div>
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="agents-list">
          {agents.length === 0 ? (
            <div className="agents-empty">
              <div className="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="3" width="20" height="14" rx="2"/>
                  <path d="M8 21h8"/>
                  <path d="M12 17v4"/>
                  <path d="M7 8h2"/>
                  <path d="M7 12h4"/>
                </svg>
              </div>
              <h3>No deployments yet</h3>
              <p>Deploy your code to run on GPU</p>
              <button className="create-btn" onClick={() => setView('create')}>
                New Deployment
              </button>
            </div>
          ) : (
            <div className="agents-grid">
              {agents.map(agent => (
                <div 
                  key={agent.id} 
                  className="agent-card"
                  onClick={() => { setSelectedAgent(agent); setView('detail'); }}
                >
                  <div className="agent-card-header">
                    <h3>{agent.name}</h3>
                    <span 
                      className="status-badge"
                      style={{ 
                        color: STATUS_CONFIG[agent.status]?.color || '#6B7280',
                        backgroundColor: `${STATUS_CONFIG[agent.status]?.color || '#6B7280'}15`
                      }}
                    >
                      <span 
                        className="status-dot"
                        style={{ backgroundColor: STATUS_CONFIG[agent.status]?.dot || '#9CA3AF' }}
                      />
                      {STATUS_CONFIG[agent.status]?.label || agent.status}
                    </span>
                  </div>
                  
                  {agent.description && (
                    <p className="agent-description">{agent.description}</p>
                  )}
                  
                  <div className="agent-stats">
                    <div className="stat-item">
                      <span className="stat-label">Runs</span>
                      <span className="stat-value">{agent.total_runs || 0}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Cost</span>
                      <span className="stat-value">${parseFloat(agent.total_cost_usd || 0).toFixed(2)}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Last Run</span>
                      <span className="stat-value">{formatDate(agent.last_run_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail View */}
      {view === 'detail' && selectedAgent && (
        <div className="agent-detail">
          <div className="detail-header">
            <div className="detail-info">
              <h2>{selectedAgent.name}</h2>
              <span 
                className="status-badge large"
                style={{ 
                  color: STATUS_CONFIG[selectedAgent.status]?.color || '#6B7280',
                  backgroundColor: `${STATUS_CONFIG[selectedAgent.status]?.color || '#6B7280'}15`
                }}
              >
                <span 
                  className="status-dot"
                  style={{ backgroundColor: STATUS_CONFIG[selectedAgent.status]?.dot || '#9CA3AF' }}
                />
                {STATUS_CONFIG[selectedAgent.status]?.label || selectedAgent.status}
              </span>
            </div>
            <div className="detail-actions">
              {selectedAgent.status === 'running' && (
                <button className="action-btn stop" onClick={() => handleToggleAgent('stop')}>
                  Stop
                </button>
              )}
              {selectedAgent.status === 'stopped' && (
                <button className="action-btn start" onClick={() => handleToggleAgent('start')}>
                  Start
                </button>
              )}
              {(selectedAgent.status === 'draft' || selectedAgent.status === 'stopped' || selectedAgent.status === 'failed') && 
               (selectedAgent.code_url || selectedAgent.repo_url) && (
                <button 
                  className="action-btn deploy" 
                  onClick={handleDeploy}
                  disabled={deploying}
                >
                  {deploying ? 'Deploying...' : 'Deploy'}
                </button>
              )}
              <button className="action-btn delete" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>

          {selectedAgent.description && (
            <p className="detail-description">{selectedAgent.description}</p>
          )}

          <div className="detail-grid">
            {/* Code Upload */}
            <div className="detail-card">
              <h3>Code</h3>
              {selectedAgent.code_url ? (
                <div className="code-uploaded">
                  <div className="code-status">
                    <span className="code-icon">✓</span>
                    <span>Code uploaded</span>
                  </div>
                  <p className="code-url">{selectedAgent.code_url.split('/').pop()}</p>
                  <label className="upload-btn secondary">
                    <input type="file" accept=".zip,.tar.gz,.tgz" onChange={handleUpload} hidden />
                    {uploading ? 'Uploading...' : 'Replace Code'}
                  </label>
                </div>
              ) : selectedAgent.repo_url ? (
                <div className="code-uploaded">
                  <div className="code-status">
                    <span className="code-icon">✓</span>
                    <span>Repository linked</span>
                  </div>
                  <p className="code-url">{selectedAgent.repo_url}</p>
                </div>
              ) : (
                <div className="code-upload-zone">
                  <p>Upload your agent code (ZIP file)</p>
                  <label className="upload-btn">
                    <input type="file" accept=".zip,.tar.gz,.tgz" onChange={handleUpload} hidden />
                    {uploading ? 'Uploading...' : 'Upload Code'}
                  </label>
                  <span className="upload-hint">or link a GitHub repository</span>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="detail-card">
              <h3>Statistics</h3>
              <div className="stats-grid">
                <div className="stat-box">
                  <span className="stat-number">{selectedAgent.total_runs || 0}</span>
                  <span className="stat-label">Total Runs</span>
                </div>
                <div className="stat-box">
                  <span className="stat-number">{selectedAgent.total_tokens || 0}</span>
                  <span className="stat-label">Tokens Used</span>
                </div>
                <div className="stat-box">
                  <span className="stat-number">${parseFloat(selectedAgent.total_cost_usd || 0).toFixed(4)}</span>
                  <span className="stat-label">Total Cost</span>
                </div>
                <div className="stat-box">
                  <span className="stat-number">{formatDate(selectedAgent.last_run_at)}</span>
                  <span className="stat-label">Last Run</span>
                </div>
              </div>
            </div>

            {/* Test Agent Section */}
            {selectedAgent.status === 'running' && (
              <div className="detail-card invoke-card">
                <h3>Test Agent</h3>
                <div className="invoke-section">
                  <div className="invoke-input-group">
                    <textarea
                      className="invoke-textarea"
                      value={invokeInput}
                      onChange={(e) => setInvokeInput(e.target.value)}
                      placeholder="Enter your message or JSON input..."
                      rows={3}
                    />
                    <button 
                      className="invoke-btn"
                      onClick={handleInvoke}
                      disabled={invoking || !invokeInput.trim()}
                    >
                      {invoking ? 'Running...' : 'Run'}
                    </button>
                  </div>

                  {invokeResponse && (
                    <div className={`invoke-response ${invokeResponse.error ? 'error' : 'success'}`}>
                      <div className="response-header">
                        <span className="response-label">
                          {invokeResponse.error ? 'Error' : 'Response'}
                        </span>
                        {invokeResponse.duration_ms && (
                          <span className="response-meta">
                            {invokeResponse.duration_ms}ms · {invokeResponse.tokens_used} tokens · ${invokeResponse.cost_usd?.toFixed(6)}
                          </span>
                        )}
                      </div>
                      <pre className="response-content">
                        {invokeResponse.error 
                          ? invokeResponse.error 
                          : invokeResponse.output?.response || JSON.stringify(invokeResponse.output, null, 2)
                        }
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* API & Webhook Section */}
            {selectedAgent.status === 'running' && (
              <div className="detail-card api-card">
                <h3>API Access</h3>
                <div className="api-section">
                  <div className="api-item">
                    <span className="api-label">Endpoint</span>
                    <div className="api-value-row">
                      <code className="api-code">{API_URL}/agents/{selectedAgent.id}/invoke</code>
                      <button 
                        className="copy-btn"
                        onClick={() => copyToClipboard(`${API_URL}/agents/${selectedAgent.id}/invoke`)}
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div className="api-item">
                    <span className="api-label">Webhook URL</span>
                    {webhookInfo ? (
                      <div className="api-value-row">
                        <code className="api-code">{webhookInfo.webhook_url}</code>
                        <button 
                          className="copy-btn"
                          onClick={() => copyToClipboard(webhookInfo.webhook_url)}
                        >
                          Copy
                        </button>
                      </div>
                    ) : (
                      <button className="generate-btn" onClick={handleGenerateWebhook}>
                        Generate Webhook
                      </button>
                    )}
                  </div>

                  {webhookInfo && (
                    <div className="api-item">
                      <span className="api-label">Webhook Token</span>
                      <div className="api-value-row">
                        <code className="api-code token">{webhookInfo.webhook_token}</code>
                        <button 
                          className="copy-btn"
                          onClick={() => copyToClipboard(webhookInfo.webhook_token)}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="api-snippets">
                    <span className="api-label">Code Snippet</span>
                    <pre className="snippet-code">{`fetch('${API_URL}/agents/${selectedAgent.id}/invoke', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-privy-id': 'YOUR_PRIVY_ID'
  },
  body: JSON.stringify({
    input: 'Your message here',
    sync: true
  })
})`}</pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentsPanel;
