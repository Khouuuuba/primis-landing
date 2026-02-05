import { useState, useEffect, useCallback, useMemo } from 'react';
import './InstancesPanel.css';
import './FilesPanel.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Files Panel Configuration
const FOLDERS = {
  datasets: { label: 'Datasets', description: 'Training data, CSV, JSON, images' },
  models: { label: 'Models', description: 'Model weights, checkpoints, configs' },
  outputs: { label: 'Outputs', description: 'Generated results, logs, exports' },
};

const FILE_ICONS = {
  csv: 'data', json: 'data', parquet: 'data',
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image',
  pt: 'model', pth: 'model', onnx: 'model', safetensors: 'model',
  py: 'code', ipynb: 'code',
  zip: 'archive', tar: 'archive', gz: 'archive',
};

function getFileCategory(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  return FILE_ICONS[ext] || 'file';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatFileDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Primis-branded tier system (no provider names exposed)
const TIER_LABELS = {
  budget: 'Budget',
  standard: 'Standard',
  performance: 'Performance',
  premium: 'Premium',
  enterprise: 'Enterprise',
  // Legacy support
  mid: 'Budget',
  high: 'Performance',
  flagship: 'Premium',
};

const TIER_COLORS = {
  budget: '#6b7280',
  standard: '#3b82f6',
  performance: '#8b5cf6',
  premium: '#f59e0b',
  enterprise: '#10b981',
  // Legacy support
  mid: '#6b7280',
  high: '#3b82f6',
  flagship: '#f59e0b',
};

// Map provider reliability to availability label
const getAvailabilityLabel = (reliability, available) => {
  if (!available) return { label: 'Limited', color: '#6b7280' };
  if (reliability >= 0.95) return { label: 'High Availability', color: '#10b981' };
  if (reliability >= 0.85) return { label: 'Available', color: '#3b82f6' };
  return { label: 'Variable', color: '#f59e0b' };
};

// Calculate tier from price and VRAM
const getTier = (pricePerHour, vramGb, providerTier) => {
  if (providerTier === 'premium' || pricePerHour >= 2.0) return 'premium';
  if (providerTier === 'enterprise' || vramGb >= 80) return 'enterprise';
  if (pricePerHour >= 0.50 || vramGb >= 40) return 'performance';
  if (pricePerHour >= 0.20) return 'standard';
  return 'budget';
};

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: '#6b7280' },
  starting: { label: 'Starting', color: '#f59e0b' },
  running: { label: 'Running', color: '#10b981' },
  stopping: { label: 'Stopping', color: '#f59e0b' },
  stopped: { label: 'Stopped', color: '#6b7280' },
  terminated: { label: 'Terminated', color: '#ef4444' },
  error: { label: 'Error', color: '#ef4444' },
};

function formatRuntime(seconds) {
  if (!seconds) return '0m';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatCurrency(amount) {
  return `$${parseFloat(amount).toFixed(2)}`;
}

function InstancesPanel({ user, credits }) {
  const [view, setView] = useState('gpus');
  const [gpus, setGpus] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [instances, setInstances] = useState([]);
  const [summary, setSummary] = useState({ running: 0, starting: 0, totalSpent: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGpu, setSelectedGpu] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState('pytorch-2.0');
  const [gpuSearch, setGpuSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [minVramFilter, setMinVramFilter] = useState(0);
  const [launchConfig, setLaunchConfig] = useState({
    name: '',
    gpuCount: 1,
    volumeSize: 20,
    useSpot: false,
  });
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Files state
  const [files, setFiles] = useState([]);
  const [fileStorage, setFileStorage] = useState(null);
  const [folderCounts, setFolderCounts] = useState({ datasets: 0, models: 0, outputs: 0 });
  const [selectedFolder, setSelectedFolder] = useState('datasets');
  const [fileSearch, setFileSearch] = useState('');
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const fetchCatalog = useCallback(async () => {
    try {
      // Fetch from multi-provider API for live GPU offerings
      const [providerGpuRes, templateRes] = await Promise.all([
        fetch(`${API_URL}/api/providers/gpus`),
        fetch(`${API_URL}/api/instances/templates`),
      ]);
      
      const providerData = await providerGpuRes.json();
      const templateData = await templateRes.json();
      
      if (providerData.success && providerData.offerings) {
        // Transform provider offerings to UI format (Primis-branded, no provider names)
        const transformedGpus = providerData.offerings
          .filter(o => o.available !== false) // Only show available GPUs
          .map(offering => ({
            id: offering.id,
            name: offering.gpuType,
            vram: offering.vramGb,
            pricePerHour: offering.pricePerHour,
            marketPrice: offering.marketPrice,
            savings: offering.savings || 0,
            tier: getTier(offering.pricePerHour, offering.vramGb, offering.tier),
            reliability: offering.reliability || 0.9,
            available: offering.available !== false,
            gpuCount: offering.gpuCount || 1,
            // Hidden from UI but used for launch
            _providerId: offering.id,
            _provider: offering.provider,
            // Computed for display
            architecture: getArchitecture(offering.gpuType),
            useCases: getUseCases(offering.gpuType, offering.vramGb),
          }))
          .sort((a, b) => a.pricePerHour - b.pricePerHour);
        
        setGpus(transformedGpus);
      }
      
      if (templateData.success) setTemplates(templateData.templates);
    } catch (err) {
      console.error('Failed to fetch catalog:', err);
    }
  }, []);

  // Helper to determine GPU architecture from name
  const getArchitecture = (gpuType) => {
    const name = gpuType.toUpperCase();
    if (name.includes('H100') || name.includes('H200')) return 'Hopper';
    if (name.includes('4090') || name.includes('4080') || name.includes('40') && name.includes('ADA')) return 'Ada Lovelace';
    if (name.includes('3090') || name.includes('3080') || name.includes('A100') || name.includes('A40')) return 'Ampere';
    if (name.includes('5090') || name.includes('5080') || name.includes('B200') || name.includes('B300')) return 'Blackwell';
    if (name.includes('MI300')) return 'CDNA 3';
    if (name.includes('V100')) return 'Volta';
    return 'Modern';
  };

  // Helper to determine use cases from GPU specs
  const getUseCases = (gpuType, vramGb) => {
    const cases = [];
    if (vramGb >= 80) cases.push('LLM Training', 'Large Models');
    else if (vramGb >= 40) cases.push('Fine-tuning', 'Training');
    else if (vramGb >= 24) cases.push('Inference', 'Fine-tuning');
    else cases.push('Inference', 'Development');
    
    const name = gpuType.toUpperCase();
    if (name.includes('H100') || name.includes('H200')) cases.push('Enterprise');
    if (name.includes('4090')) cases.push('Image Generation');
    return cases.slice(0, 3);
  };

  const fetchInstances = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/instances`, {
        headers: { 'x-privy-id': user?.id || 'demo-user' },
      });
      const data = await res.json();
      
      if (data.success) {
        setInstances(data.instances);
        setSummary(data.summary);
      }
    } catch (err) {
      console.error('Failed to fetch instances:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCatalog();
    fetchInstances();
  }, [fetchCatalog, fetchInstances]);

  useEffect(() => {
    const activeCount = instances.filter(i => ['running', 'starting', 'pending'].includes(i.status)).length;
    if (activeCount > 0) {
      const interval = setInterval(fetchInstances, 5000);
      return () => clearInterval(interval);
    }
  }, [instances, fetchInstances]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Filter GPUs by search, tier, and VRAM
  const filteredGpus = useMemo(() => {
    let filtered = gpus;
    
    // Apply search filter
    if (gpuSearch.trim()) {
      const search = gpuSearch.toLowerCase();
      filtered = filtered.filter(gpu => 
        gpu.name.toLowerCase().includes(search) ||
        gpu.architecture.toLowerCase().includes(search) ||
        gpu.useCases?.some(uc => uc.toLowerCase().includes(search))
      );
    }
    
    // Apply tier filter
    if (tierFilter !== 'all') {
      filtered = filtered.filter(gpu => gpu.tier === tierFilter);
    }
    
    // Apply VRAM filter
    if (minVramFilter > 0) {
      filtered = filtered.filter(gpu => gpu.vram >= minVramFilter);
    }
    
    return filtered;
  }, [gpus, gpuSearch, tierFilter, minVramFilter]);

  // Calculate summary stats for the marketplace
  const marketplaceStats = useMemo(() => {
    if (gpus.length === 0) return null;
    const cheapest = gpus[0];
    const avgSavings = Math.round(gpus.reduce((sum, g) => sum + (g.savings || 0), 0) / gpus.length);
    return {
      totalGpus: gpus.length,
      cheapestPrice: cheapest?.pricePerHour,
      cheapestName: cheapest?.name,
      avgSavings,
    };
  }, [gpus]);

  const handleLaunch = async () => {
    if (!selectedGpu) return;
    
    setIsLaunching(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_URL}/api/instances/launch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-privy-id': user?.id || 'demo-user',
        },
        body: JSON.stringify({
          gpuId: selectedGpu.id,
          templateId: selectedTemplate,
          ...launchConfig,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSuccess(`Instance "${data.instance.name}" is launching`);
        setSelectedGpu(null);
        setLaunchConfig({ name: '', gpuCount: 1, volumeSize: 20, useSpot: false });
        await fetchInstances();
        setView('instances');
      } else {
        // Handle specific error cases with better UX
        if (data.gpuUnavailable && data.suggestedGpus?.length > 0) {
          // Find suggested GPUs in our catalog
          const suggestions = data.suggestedGpus
            .map(id => gpus.find(g => g.id === id))
            .filter(Boolean)
            .map(g => g.name)
            .slice(0, 3);
          
          const suggestionText = suggestions.length > 0 
            ? ` Try: ${suggestions.join(', ')}.`
            : '';
          
          setError(`${data.error}${suggestionText}`);
        } else if (data.providerNotReady) {
          setError(data.error);
        } else {
          setError(data.error || 'Failed to launch instance');
        }
      }
    } catch (err) {
      setError('Failed to launch instance');
    } finally {
      setIsLaunching(false);
    }
  };

  const handleStop = async (instanceId) => {
    try {
      const res = await fetch(`${API_URL}/api/instances/${instanceId}/stop`, {
        method: 'POST',
        headers: { 'x-privy-id': user?.id || 'demo-user' },
      });
      const data = await res.json();
      
      if (data.success) {
        setSuccess(`Instance stopped — ${formatCurrency(data.cost)} charged`);
        fetchInstances();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to stop instance');
    }
  };

  const handleTerminate = async (instanceId) => {
    if (!confirm('Terminate this instance? All data will be lost.')) return;
    
    try {
      const res = await fetch(`${API_URL}/api/instances/${instanceId}/terminate`, {
        method: 'POST',
        headers: { 'x-privy-id': user?.id || 'demo-user' },
      });
      const data = await res.json();
      
      if (data.success) {
        setSuccess('Instance terminated');
        fetchInstances();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to terminate instance');
    }
  };

  const handleRestart = async (instanceId) => {
    try {
      const res = await fetch(`${API_URL}/api/instances/${instanceId}/restart`, {
        method: 'POST',
        headers: { 'x-privy-id': user?.id || 'demo-user' },
      });
      const data = await res.json();
      
      if (data.success) {
        setSuccess('Instance restarting');
        fetchInstances();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to restart instance');
    }
  };

  // Files Functions
  const fetchFiles = useCallback(async () => {
    try {
      setIsLoadingFiles(true);
      const response = await fetch(`${API_URL}/api/files?folder=${selectedFolder}`, {
        headers: { 'x-privy-id': user?.id || 'demo-user' },
      });
      const data = await response.json();
      
      if (data.success) {
        setFiles(data.files || []);
        setFileStorage(data.storage);
        if (data.folderCounts) setFolderCounts(data.folderCounts);
      }
    } catch (err) {
      console.error('Failed to fetch files:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [selectedFolder, user?.id]);

  useEffect(() => {
    if (view === 'files') {
      fetchFiles();
    }
  }, [view, fetchFiles]);

  const handleFileUpload = async (file) => {
    if (!file) return;
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', selectedFolder);
      
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);
      
      const response = await fetch(`${API_URL}/api/files/upload`, {
        method: 'POST',
        headers: { 'x-privy-id': user?.id || 'demo-user' },
        body: formData,
      });
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      const data = await response.json();
      
      if (data.success) {
        setSuccess(`${file.name} uploaded successfully`);
        fetchFiles();
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError('Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const handleDeleteFile = async (folder, filename) => {
    if (!confirm(`Delete "${filename}"?`)) return;
    
    try {
      const response = await fetch(`${API_URL}/api/files/${folder}/${filename}`, {
        method: 'DELETE',
        headers: { 'x-privy-id': user?.id || 'demo-user' },
      });
      const data = await response.json();
      
      if (data.success) {
        setSuccess('File deleted');
        fetchFiles();
      } else {
        setError(data.error || 'Delete failed');
      }
    } catch (err) {
      setError('Delete failed');
    }
  };

  const handleDownloadFile = async (folder, filename) => {
    try {
      const response = await fetch(`${API_URL}/api/files/download/${folder}/${filename}`, {
        headers: { 'x-privy-id': user?.id || 'demo-user' },
      });
      const data = await response.json();
      
      if (data.success && data.downloadUrl) {
        window.open(data.downloadUrl, '_blank');
      } else {
        setError(data.error || 'Download failed');
      }
    } catch (err) {
      setError('Download failed');
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(fileSearch.toLowerCase())
  );

  const activeInstances = instances.filter(i => ['running', 'starting', 'pending'].includes(i.status));
  const pastInstances = instances.filter(i => !['running', 'starting', 'pending'].includes(i.status));
  const hourlyRate = selectedGpu ? (launchConfig.useSpot ? selectedGpu.spotPrice : selectedGpu.pricePerHour) * launchConfig.gpuCount : 0;

  return (
    <div className="instances-panel">
      {/* Header */}
      <div className="instances-header">
        <div className="instances-title">
          <h2>GPU Instances</h2>
        </div>
        
        <div className="header-metrics">
          <div className="metric">
            <span className="metric-label">Active</span>
            <span className={`metric-value ${activeInstances.length > 0 ? 'highlight' : ''}`}>
              {activeInstances.length}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="instances-message error">
          <span className="msg-icon">×</span>
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      {success && (
        <div className="instances-message success">
          <span className="msg-icon">✓</span>
          <span>{success}</span>
          <button onClick={() => setSuccess(null)}>×</button>
        </div>
      )}

      {/* View Toggle */}
      <div className="view-toggle">
        <button 
          className={view === 'gpus' ? 'active' : ''}
          onClick={() => setView('gpus')}
        >
          Launch Instance
        </button>
        <button 
          className={view === 'instances' ? 'active' : ''}
          onClick={() => setView('instances')}
        >
          My Instances
          {activeInstances.length > 0 && (
            <span className="badge">{activeInstances.length}</span>
          )}
        </button>
        <button 
          className={view === 'files' ? 'active' : ''}
          onClick={() => setView('files')}
        >
          Files
        </button>
      </div>

      {/* Content with transition */}
      <div className="view-container">
        <div className={`view-content ${view === 'gpus' ? 'visible' : 'hidden'}`}>
          <div className="launch-layout">
            {/* Left: GPU Selection */}
            <div className="gpu-panel">
              {/* Minimal stats inline with filters */}
              <div className="gpu-panel-header">
                {marketplaceStats && (
                  <div className="inline-stats">
                    <span className="stat-item">{marketplaceStats.totalGpus} GPUs</span>
                    <span className="stat-divider">·</span>
                    <span className="stat-item">from ${marketplaceStats.cheapestPrice?.toFixed(2)}/hr</span>
                    <span className="stat-divider">·</span>
                    <span className="stat-item highlight">avg {marketplaceStats.avgSavings}% off</span>
                  </div>
                )}
              </div>
              
              {/* Clean Filter Bar */}
              <div className="gpu-filters">
                <div className="gpu-search">
                  <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="M21 21l-4.35-4.35"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={gpuSearch}
                    onChange={(e) => setGpuSearch(e.target.value)}
                  />
                </div>
                
                {/* Tier Pills */}
                <div className="filter-pills">
                  {['all', 'budget', 'performance', 'premium', 'enterprise'].map(tier => (
                    <button
                      key={tier}
                      className={`filter-pill ${tierFilter === tier ? 'active' : ''}`}
                      onClick={() => setTierFilter(tier)}
                    >
                      {tier === 'all' ? 'All' : tier.charAt(0).toUpperCase() + tier.slice(1)}
                    </button>
                  ))}
                </div>
                
                {/* VRAM Pills */}
                <div className="filter-pills vram-pills">
                  {[
                    { value: 0, label: 'Any' },
                    { value: 24, label: '24GB+' },
                    { value: 48, label: '48GB+' },
                    { value: 80, label: '80GB+' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      className={`filter-pill ${minVramFilter === opt.value ? 'active' : ''}`}
                      onClick={() => setMinVramFilter(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="gpu-list">
                {filteredGpus.map((gpu, index) => {
                  const isRecommended = index === 0 && gpu.savings > 15;
                  const providerPrefix = gpu.id?.split('-')[0] || '';
                  const isReady = providerPrefix === 'runpod';
                  const isComingSoon = providerPrefix === 'vastai' || providerPrefix === 'lambda';
                  
                  return (
                    <div 
                      key={gpu.id}
                      className={`gpu-card ${selectedGpu?.id === gpu.id ? 'selected' : ''} ${isComingSoon ? 'coming-soon' : ''}`}
                      onClick={() => setSelectedGpu(gpu)}
                    >
                      <div className="gpu-main">
                        <div className="gpu-name">
                          {gpu.name}
                          {gpu.gpuCount > 1 && <span className="gpu-count">×{gpu.gpuCount}</span>}
                          {isRecommended && <span className="rec-dot" title="Best value" />}
                        </div>
                        <div className="gpu-meta">
                          <span className="vram">{gpu.vram}GB</span>
                          <span className="arch">{gpu.architecture}</span>
                          {isComingSoon && <span className="coming-soon-badge">Soon</span>}
                        </div>
                      </div>
                      <div className="gpu-pricing">
                        <span className="price-current">${gpu.pricePerHour.toFixed(2)}</span>
                        {gpu.savings > 0 && (
                          <span className="price-savings">-{gpu.savings}%</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredGpus.length === 0 && (
                  <div className="no-results">No GPUs match "{gpuSearch}"</div>
                )}
              </div>
            </div>

            {/* Right: Configuration */}
            <div className={`config-panel ${selectedGpu ? 'visible' : ''}`}>
              {selectedGpu ? (
                <>
                  <div className="config-header">
                    <span className="config-title">Configuration</span>
                  </div>
                  
                  <div className="config-form">
                    <div className="form-field">
                      <label>Template</label>
                      <div className="select-wrapper">
                        <select 
                          value={selectedTemplate}
                          onChange={(e) => setSelectedTemplate(e.target.value)}
                        >
                          {templates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <svg className="select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
                          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>
                    
                    <div className="form-row">
                      <div className="form-field">
                        <label>GPUs</label>
                        <div className="select-wrapper small">
                          <select 
                            value={launchConfig.gpuCount}
                            onChange={(e) => setLaunchConfig(prev => ({ ...prev, gpuCount: parseInt(e.target.value) }))}
                          >
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                            <option value={4}>4</option>
                            <option value={8}>8</option>
                          </select>
                          <svg className="select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
                            <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                      
                      <div className="form-field">
                        <label>Storage</label>
                        <div className="select-wrapper small">
                          <select 
                            value={launchConfig.volumeSize}
                            onChange={(e) => setLaunchConfig(prev => ({ ...prev, volumeSize: parseInt(e.target.value) }))}
                          >
                            <option value={20}>20 GB</option>
                            <option value={50}>50 GB</option>
                            <option value={100}>100 GB</option>
                            <option value={200}>200 GB</option>
                          </select>
                          <svg className="select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
                            <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                    
                    <div className="form-field">
                      <label>Instance Name <span className="optional">(optional)</span></label>
                      <input 
                        type="text"
                        placeholder={`${selectedGpu.name.toLowerCase().replace(/\s/g, '-')}-001`}
                        value={launchConfig.name}
                        onChange={(e) => setLaunchConfig(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    
                    <div 
                      className={`spot-toggle ${launchConfig.useSpot ? 'active' : ''}`}
                      onClick={() => setLaunchConfig(prev => ({ ...prev, useSpot: !prev.useSpot }))}
                    >
                      <div className="toggle-switch">
                        <div className="toggle-knob" />
                      </div>
                      <div className="toggle-content">
                        <span className="toggle-label">Spot Instance</span>
                        <span className="toggle-desc">Save ~25% — may be interrupted</span>
                      </div>
                      {launchConfig.useSpot && (
                        <span className="spot-price">${selectedGpu.spotPrice}/hr</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="config-footer">
                    <div className="footer-cost">
                      <span className="footer-cost-label">Estimated cost</span>
                      <span className="footer-cost-value">${hourlyRate.toFixed(2)}/hr</span>
                    </div>
                    <button 
                      className="launch-btn"
                      onClick={handleLaunch}
                      disabled={isLaunching || credits < hourlyRate}
                    >
                      {isLaunching ? (
                        <span className="spinner" />
                      ) : (
                        'Launch Instance'
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="config-placeholder">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                  </svg>
                  <p>Select a GPU to configure</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`view-content ${view === 'instances' ? 'visible' : 'hidden'}`}>
          {/* Active Instances */}
          {activeInstances.length > 0 && (
            <div className="section">
              <div className="section-header">
                <h3>Active</h3>
                <span className="section-hint">{activeInstances.length} running</span>
              </div>
              
              <div className="instance-list">
                {activeInstances.map(instance => (
                  <div key={instance.id} className="instance-card active">
                    <div className="instance-header">
                      <div className="instance-name">{instance.name}</div>
                      <div 
                        className="instance-status"
                        style={{ 
                          background: `${STATUS_CONFIG[instance.status].color}15`,
                          color: STATUS_CONFIG[instance.status].color 
                        }}
                      >
                        <span className="status-dot" style={{ background: STATUS_CONFIG[instance.status].color }} />
                        {STATUS_CONFIG[instance.status].label}
                      </div>
                    </div>
                    
                    <div className="instance-details">
                      <div className="detail">
                        <span className="detail-label">GPU</span>
                        <span className="detail-value">{instance.gpu_type}</span>
                      </div>
                      <div className="detail">
                        <span className="detail-label">Runtime</span>
                        <span className="detail-value">{formatRuntime(instance.runtime_seconds)}</span>
                      </div>
                      <div className="detail">
                        <span className="detail-label">Cost</span>
                        <span className="detail-value cost">{formatCurrency(instance.session_cost || 0)}</span>
                      </div>
                    </div>
                    
                    {instance.jupyter_url && (
                      <div className="instance-connect">
                        <a href={instance.jupyter_url} target="_blank" rel="noopener noreferrer" className="connect-btn">
                          Open JupyterLab
                        </a>
                        {instance.ssh_host && (
                          <code className="ssh-info">
                            ssh root@{instance.ssh_host} -p {instance.ssh_port}
                          </code>
                        )}
                      </div>
                    )}
                    
                    <div className="instance-actions">
                      <button className="inst-btn stop" onClick={() => handleStop(instance.id)}>
                        Stop Instance
                      </button>
                      <button className="inst-btn terminate" onClick={() => handleTerminate(instance.id)}>
                        Terminate
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Past Instances */}
          {pastInstances.length > 0 && (
            <div className="section">
              <div className="section-header">
                <h3>History</h3>
              </div>
              
              <div className="history-table">
                <div className="table-header">
                  <span>Name</span>
                  <span>GPU</span>
                  <span>Runtime</span>
                  <span>Cost</span>
                  <span>Status</span>
                  <span></span>
                </div>
                
                {pastInstances.slice(0, 10).map(instance => (
                  <div key={instance.id} className="table-row">
                    <span className="cell-name">{instance.name}</span>
                    <span>{instance.gpu_type}</span>
                    <span>{formatRuntime(instance.total_runtime_seconds)}</span>
                    <span>{formatCurrency(instance.total_cost_usd)}</span>
                    <span 
                      className="cell-status"
                      style={{ color: STATUS_CONFIG[instance.status]?.color }}
                    >
                      {STATUS_CONFIG[instance.status]?.label}
                    </span>
                    <span>
                      {instance.status === 'stopped' && (
                        <button 
                          className="mini-btn"
                          onClick={() => handleRestart(instance.id)}
                        >
                          Restart
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {instances.length === 0 && !isLoading && (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
              </div>
              <h3>No instances yet</h3>
              <p>Launch your first GPU instance to get started</p>
              <button className="launch-first-btn" onClick={() => setView('gpus')}>
                Launch Instance
              </button>
            </div>
          )}
        </div>

        {/* Files View */}
        <div className={`view-content ${view === 'files' ? 'visible' : 'hidden'}`}>
          <div className="files-layout">
            {/* Sidebar */}
            <div className="files-sidebar-compact">
              {/* Folder Navigation */}
              <div className="folder-nav-compact">
                {Object.entries(FOLDERS).map(([key, folder]) => (
                  <button
                    key={key}
                    className={`folder-btn ${selectedFolder === key ? 'active' : ''}`}
                    onClick={() => setSelectedFolder(key)}
                  >
                    <span className="folder-name">{folder.label}</span>
                    <span className="folder-count">{folderCounts[key] || 0}</span>
                  </button>
                ))}
              </div>

              {/* Upload Zone */}
              <div 
                className={`upload-zone-compact ${dragOver ? 'drag-over' : ''} ${isUploading ? 'uploading' : ''}`}
                onDrop={handleFileDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
              >
                {isUploading ? (
                  <div className="upload-progress-compact">
                    <div className="progress-bar-compact">
                      <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <span>{uploadProgress}%</span>
                  </div>
                ) : (
                  <>
                    <div className="upload-icon-compact">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                      </svg>
                    </div>
                    <span>Drop files</span>
                    <label className="browse-btn">
                      Browse
                      <input 
                        type="file" 
                        onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </>
                )}
              </div>

              {/* Storage */}
              {fileStorage && (
                <div className="storage-compact">
                  <div className="storage-bar-compact">
                    <div 
                      className="storage-fill" 
                      style={{ width: `${Math.min(parseFloat(fileStorage.percentUsed), 100)}%` }}
                    />
                  </div>
                  <span>{fileStorage.usedGB} / {fileStorage.maxGB} GB</span>
                </div>
              )}
            </div>

            {/* Main Area */}
            <div className="files-main-area">
              {/* Search */}
              <div className="files-search-bar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="M21 21l-4.35-4.35"/>
                </svg>
                <input 
                  type="text"
                  placeholder={`Search in ${FOLDERS[selectedFolder].label.toLowerCase()}...`}
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                />
              </div>

              {/* File List */}
              <div className="files-table">
                <div className="files-table-header">
                  <span>Name</span>
                  <span>Size</span>
                  <span>Modified</span>
                  <span></span>
                </div>
                
                {isLoadingFiles ? (
                  <div className="files-loading-state">
                    <span className="spinner" />
                    <span>Loading files...</span>
                  </div>
                ) : filteredFiles.length === 0 ? (
                  <div className="files-empty-state">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    <h4>{fileSearch ? 'No matching files' : `No files in ${FOLDERS[selectedFolder].label}`}</h4>
                    <p>{fileSearch ? 'Try a different search' : FOLDERS[selectedFolder].description}</p>
                  </div>
                ) : (
                  filteredFiles.map((file, index) => (
                    <div key={file.id || index} className="file-row-compact">
                      <div className="file-name-cell">
                        <div className={`file-icon-compact ${getFileCategory(file.name)}`}>
                          {getFileCategory(file.name) === 'image' && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="3" width="18" height="18" rx="2"/>
                              <circle cx="8.5" cy="8.5" r="1.5"/>
                              <path d="M21 15l-5-5L5 21"/>
                            </svg>
                          )}
                          {getFileCategory(file.name) === 'data' && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                            </svg>
                          )}
                          {getFileCategory(file.name) === 'model' && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"/>
                              <circle cx="12" cy="12" r="4"/>
                              <line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/>
                              <line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/>
                              <line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/>
                              <line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/>
                            </svg>
                          )}
                          {getFileCategory(file.name) === 'code' && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="16 18 22 12 16 6"/>
                              <polyline points="8 6 2 12 8 18"/>
                            </svg>
                          )}
                          {(getFileCategory(file.name) === 'file' || getFileCategory(file.name) === 'archive') && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                              <polyline points="13 2 13 9 20 9"/>
                            </svg>
                          )}
                        </div>
                        <div className="file-name-info">
                          <span className="file-name-text">{file.name}</span>
                        </div>
                      </div>
                      <span className="file-size">{formatBytes(file.size)}</span>
                      <span className="file-date">{formatFileDate(file.createdAt)}</span>
                      <div className="file-actions">
                        <button 
                          className="file-action-btn"
                          onClick={() => handleDownloadFile(file.folder, file.name)}
                          title="Download"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                          </svg>
                        </button>
                        <button 
                          className="file-action-btn delete"
                          onClick={() => handleDeleteFile(file.folder, file.name)}
                          title="Delete"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InstancesPanel;
