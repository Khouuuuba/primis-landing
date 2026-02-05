import { useState, useEffect } from 'react';
import './ServerlessPanel.css';

// Ensure API_URL always ends with /api
const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const API_URL = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;

// Model Catalog
const MODEL_CATALOG = [
  {
    id: 'sdxl',
    name: 'SDXL 1.0',
    category: 'image',
    description: 'High-quality image generation',
    pricing: '$0.01/image',
    pricePerUnit: 0.01,
    unit: 'image',
    resolution: '1024×1024',
    speed: '~15s/image',
    available: true
  },
  {
    id: 'llama-3-8b',
    name: 'Llama 3 8B',
    category: 'text',
    description: 'Fast text generation & chat',
    pricing: '$0.0002/1K tokens',
    pricePerUnit: 0.0002,
    unit: '1K tokens',
    contextWindow: '8K tokens',
    speed: '~50 tok/s',
    available: true
  },
  {
    id: 'llama-3-70b',
    name: 'Llama 3 70B',
    category: 'text',
    description: 'High-quality reasoning & analysis',
    pricing: '$0.001/1K tokens',
    pricePerUnit: 0.001,
    unit: '1K tokens',
    contextWindow: '8K tokens',
    speed: '~20 tok/s',
    available: false // Requires larger endpoint
  },
  {
    id: 'whisper-large',
    name: 'Whisper Large',
    category: 'audio',
    description: 'Speech-to-text transcription',
    pricing: '$0.006/minute',
    pricePerUnit: 0.006,
    unit: 'minute',
    languages: '99+ languages',
    speed: '~10x realtime',
    available: true
  }
];

const CATEGORY_ICONS = {
  image: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="M21 15l-5-5L5 21"/>
    </svg>
  ),
  text: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <line x1="10" y1="9" x2="8" y2="9"/>
    </svg>
  ),
  audio: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  )
};

function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ServerlessPanel({ credits, privyId, onCreditsUpdate, showToast }) {
  const [selectedModel, setSelectedModel] = useState('sdxl');
  
  // Image generation state
  const [prompts, setPrompts] = useState('');
  const [template, setTemplate] = useState('sdxl');
  const [templates, setTemplates] = useState([]);
  const [estimate, setEstimate] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [isLoadingJobDetail, setIsLoadingJobDetail] = useState(false);
  const [loadingJobId, setLoadingJobId] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [jobCache, setJobCache] = useState({}); // Cache job details

  // Text generation state
  const [textPrompt, setTextPrompt] = useState('');
  const [textResponse, setTextResponse] = useState(null);
  const [textEstimate, setTextEstimate] = useState(null);
  const [maxTokens, setMaxTokens] = useState(512);
  const [temperature, setTemperature] = useState(0.7);
  const [isGeneratingText, setIsGeneratingText] = useState(false);

  // Audio transcription state
  const [audioFile, setAudioFile] = useState(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioEstimate, setAudioEstimate] = useState(null);
  const [transcriptResult, setTranscriptResult] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionTask, setTranscriptionTask] = useState('transcribe');

  // Usage history state
  const [usageHistory, setUsageHistory] = useState([]);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);

  const currentModel = MODEL_CATALOG.find(m => m.id === selectedModel) || MODEL_CATALOG[0];

  // Fetch templates
  useEffect(() => {
    fetch(`${API_URL}/batch/templates`)
      .then(r => r.json())
      .then(data => setTemplates(data.templates || []))
      .catch(err => console.error('Failed to fetch templates:', err));
  }, []);

  // Fetch jobs
  const fetchJobs = () => {
    if (!privyId) return;
    
    fetch(`${API_URL}/batch/jobs`, {
      headers: { 'x-privy-id': privyId }
    })
      .then(r => r.json())
      .then(data => {
        setJobs(data.jobs || []);
        setIsLoadingJobs(false);
      })
      .catch(err => {
        console.error('Failed to fetch jobs:', err);
        setIsLoadingJobs(false);
      });
  };

  useEffect(() => {
    fetchJobs();
  }, [privyId]);

  // Auto-refresh when jobs are processing
  useEffect(() => {
    const hasProcessing = jobs.some(j => j.status === 'processing' || j.status === 'pending');
    if (hasProcessing) {
      const interval = setInterval(fetchJobs, 5000);
      return () => clearInterval(interval);
    }
  }, [jobs, privyId]);

  // Image cost estimate
  useEffect(() => {
    const promptList = prompts.split('\n').filter(p => p.trim());
    
    if (promptList.length === 0) {
      setEstimate(null);
      return;
    }

    const debounce = setTimeout(() => {
      fetch(`${API_URL}/batch/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts: promptList, template })
      })
        .then(r => r.json())
        .then(data => setEstimate(data))
        .catch(err => console.error('Estimate failed:', err));
    }, 300);

    return () => clearTimeout(debounce);
  }, [prompts, template]);

  // Text cost estimate
  useEffect(() => {
    if (!textPrompt.trim() || currentModel.category !== 'text') {
      setTextEstimate(null);
      return;
    }

    const debounce = setTimeout(() => {
      fetch(`${API_URL}/inference/text/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: textPrompt, maxTokens, model: selectedModel })
      })
        .then(r => r.json())
        .then(data => setTextEstimate(data))
        .catch(err => console.error('Text estimate failed:', err));
    }, 300);

    return () => clearTimeout(debounce);
  }, [textPrompt, maxTokens, selectedModel, currentModel.category]);

  // Audio cost estimate
  useEffect(() => {
    if (!audioDuration || currentModel.category !== 'audio') {
      setAudioEstimate(null);
      return;
    }

    fetch(`${API_URL}/inference/audio/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationSeconds: audioDuration })
    })
      .then(r => r.json())
      .then(data => setAudioEstimate(data))
      .catch(err => console.error('Audio estimate failed:', err));
  }, [audioDuration, currentModel.category]);

  // Fetch inference usage history
  const fetchUsageHistory = () => {
    if (!privyId) return;
    
    setIsLoadingUsage(true);
    fetch(`${API_URL}/inference/history`, {
      headers: { 'x-privy-id': privyId }
    })
      .then(r => r.json())
      .then(data => {
        setUsageHistory(data.history || []);
        setIsLoadingUsage(false);
      })
      .catch(err => {
        console.error('Failed to fetch usage history:', err);
        setIsLoadingUsage(false);
      });
  };

  useEffect(() => {
    if (currentModel.category !== 'image') {
      fetchUsageHistory();
    }
  }, [privyId, currentModel.category]);

  const handleSubmit = async () => {
    const promptList = prompts.split('\n').filter(p => p.trim());
    
    if (promptList.length === 0) {
      showToast('Enter at least one prompt', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/batch/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-privy-id': privyId
        },
        body: JSON.stringify({ prompts: promptList, template })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        showToast(errorData.error || 'Failed to create job', 'error');
        return;
      }

      const data = await response.json();

      if (data.success) {
        showToast(`Job created with ${promptList.length} images`, 'success');
        setPrompts('');
        setEstimate(null);
        fetchJobs();
        
        // Start processing
        fetch(`${API_URL}/batch/jobs/${data.job.id}/process`, {
          method: 'POST',
          headers: { 'x-privy-id': privyId }
        });

        if (onCreditsUpdate && data.newBalance !== undefined) {
          onCreditsUpdate(data.newBalance);
        }
      } else {
        showToast(data.error || 'Failed to create job', 'error');
      }
    } catch (err) {
      showToast('Failed to create job', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewJob = async (job) => {
    // Prevent double-clicks
    if (isLoadingJobDetail || loadingJobId === job.id) return;
    
    // Check cache first (only for completed jobs)
    const cachedJob = jobCache[job.id];
    if (cachedJob && job.status === 'completed') {
      setSelectedJob(cachedJob);
      return;
    }
    
    setLoadingJobId(job.id);
    setIsLoadingJobDetail(true);
    
    // Immediately show modal with loading state
    setSelectedJob({
      id: job.id,
      status: job.status,
      totalItems: job.totalItems || job.total_items,
      completedItems: job.completedItems || job.completed_items || 0,
      failedItems: job.failedItems || job.failed_items || 0,
      totalCost: job.totalCost || job.total_cost || 0,
      items: null, // null indicates loading
      isLoading: true
    });

    try {
      const response = await fetch(`${API_URL}/batch/jobs/${job.id}`, {
        headers: { 'x-privy-id': privyId }
      });
      const data = await response.json();
      
      if (data.job) {
        const fullJob = {
          ...data.job,
          items: data.items || [],
          isLoading: false
        };
        
        // Cache completed jobs
        if (data.job.status === 'completed') {
          setJobCache(prev => ({ ...prev, [job.id]: fullJob }));
        }
        
        setSelectedJob(fullJob);
      } else {
        showToast('Failed to load job details', 'error');
        setSelectedJob(null);
      }
    } catch (err) {
      console.error('Failed to load job:', err);
      showToast('Failed to load job details', 'error');
      setSelectedJob(null);
    } finally {
      setIsLoadingJobDetail(false);
      setLoadingJobId(null);
    }
  };

  const handleRetry = async (jobId) => {
    try {
      const response = await fetch(`${API_URL}/batch/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: { 'x-privy-id': privyId }
      });
      const data = await response.json();
      if (data.success) {
        showToast('Retrying failed items', 'success');
        fetchJobs();
        if (selectedJob?.id === jobId) {
          handleViewJob({ id: jobId });
        }
      }
    } catch (err) {
      showToast('Failed to retry', 'error');
    }
  };

  // Text generation handler
  const handleTextGenerate = async () => {
    if (!textPrompt.trim()) {
      showToast('Enter a prompt', 'error');
      return;
    }

    setIsGeneratingText(true);
    setTextResponse(null);

    try {
      const response = await fetch(`${API_URL}/inference/text/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-privy-id': privyId
        },
        body: JSON.stringify({
          prompt: textPrompt,
          model: selectedModel,
          maxTokens,
          temperature
        })
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.error || 'Generation failed', 'error');
        return;
      }

      if (data.success) {
        setTextResponse(data);
        if (onCreditsUpdate && data.newBalance !== undefined) {
          onCreditsUpdate(data.newBalance);
        }
        showToast(`Generated ${data.usage.outputTokens} tokens`, 'success');
      }
    } catch (err) {
      showToast('Failed to generate text', 'error');
    } finally {
      setIsGeneratingText(false);
    }
  };

  // Audio file handler
  const handleAudioFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/m4a', 'audio/mp4'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|webm|m4a|mp4)$/i)) {
      showToast('Invalid audio format. Use MP3, WAV, OGG, or M4A.', 'error');
      return;
    }

    setAudioFile(file);
    setTranscriptResult(null);

    // Get audio duration
    const audio = new Audio();
    audio.src = URL.createObjectURL(file);
    audio.onloadedmetadata = () => {
      setAudioDuration(Math.ceil(audio.duration));
      URL.revokeObjectURL(audio.src);
    };
  };

  // Audio transcription handler
  const handleTranscribe = async () => {
    if (!audioFile) {
      showToast('Select an audio file', 'error');
      return;
    }

    setIsTranscribing(true);
    setTranscriptResult(null);

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioFile);
      
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1]; // Remove data URL prefix

        const response = await fetch(`${API_URL}/inference/audio/transcribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-privy-id': privyId
          },
          body: JSON.stringify({
            audioBase64: base64,
            durationSeconds: audioDuration,
            task: transcriptionTask
          })
        });

        const data = await response.json();

        if (!response.ok) {
          showToast(data.error || 'Transcription failed', 'error');
          setIsTranscribing(false);
          return;
        }

        if (data.success) {
          setTranscriptResult(data);
          if (onCreditsUpdate && data.newBalance !== undefined) {
            onCreditsUpdate(data.newBalance);
          }
          showToast('Transcription complete', 'success');
        }
        setIsTranscribing(false);
      };

      reader.onerror = () => {
        showToast('Failed to read audio file', 'error');
        setIsTranscribing(false);
      };
    } catch (err) {
      showToast('Failed to transcribe audio', 'error');
      setIsTranscribing(false);
    }
  };

  const promptCount = prompts.split('\n').filter(p => p.trim()).length;
  const processingCount = jobs.filter(j => j.status === 'processing').length;

  return (
    <div className="serverless-panel">
      {/* Header */}
      <div className="serverless-header">
        <div className="serverless-title">
          <h2>Serverless</h2>
          <p>Run AI models on-demand. Pay only for what you use.</p>
        </div>
      </div>

      {/* Model Catalog */}
      <div className="model-catalog">
        <div className="catalog-header">
          <span className="catalog-label">Select Model</span>
        </div>
        <div className="model-grid">
          {MODEL_CATALOG.map(model => (
            <div
              key={model.id}
              className={`model-card ${selectedModel === model.id ? 'selected' : ''} ${!model.available ? 'disabled' : ''}`}
              onClick={() => model.available && setSelectedModel(model.id)}
            >
              <div className="model-card-header">
                <span className={`model-category ${model.category}`}>
                  {CATEGORY_ICONS[model.category]}
                </span>
                {!model.available && <span className="coming-soon">Soon</span>}
              </div>
              <div className="model-card-body">
                <h4>{model.name}</h4>
                <p>{model.description}</p>
              </div>
              <div className="model-card-footer">
                <span className="model-price">{model.pricing}</span>
                <span className="model-speed">{model.speed}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content - Side by Side */}
      <div className="serverless-grid">
        {/* Left: Generation Card */}
        <div className="generation-card">
          {currentModel.category === 'image' ? (
            <>
              <div className="card-header">
                <h3>Image Generation</h3>
                {promptCount > 0 && (
                  <span className="prompt-badge">{promptCount} image{promptCount !== 1 ? 's' : ''}</span>
                )}
              </div>

              <div className="card-body">
                {/* Prompts Input */}
                <div className="form-group">
                  <label>Prompts</label>
                  <textarea
                    className="prompts-input"
                    placeholder="Enter prompts, one per line...

a futuristic city at sunset, cyberpunk style
portrait of a robot scientist, studio lighting
abstract geometric patterns in gold and blue"
                    value={prompts}
                    onChange={(e) => setPrompts(e.target.value)}
                    rows={10}
                  />
                </div>

                {/* Config Row */}
                <div className="config-row">
                  <div className="config-item">
                    <span className="config-label">Model</span>
                    <span className="config-value">{currentModel.name}</span>
                  </div>
                  <div className="config-item">
                    <span className="config-label">Resolution</span>
                    <span className="config-value">{currentModel.resolution}</span>
                  </div>
                  <div className="config-item">
                    <span className="config-label">Price</span>
                    <span className="config-value">{currentModel.pricing}</span>
                  </div>
                </div>

                {/* Estimate */}
                {estimate && estimate.itemCount > 0 && (
                  <div className="estimate-box">
                    <div className="estimate-line">
                      <span>{estimate.itemCount} images × $0.01</span>
                      <span className="estimate-total">${(estimate.totalCost || 0).toFixed(2)}</span>
                    </div>
                    <div className="estimate-time">
                      Est. {Math.ceil((estimate.estimatedTimeSeconds || estimate.itemCount * 15) / 60)} min
                    </div>
                  </div>
                )}

                {/* Submit */}
                <button 
                  className="generate-btn"
                  onClick={handleSubmit}
                  disabled={isSubmitting || promptCount === 0 || (estimate && (estimate.totalCost || 0) > credits)}
                >
                  {isSubmitting ? (
                    <span className="spinner" />
                  ) : (
                    `Generate${promptCount > 0 ? ` ${promptCount} Image${promptCount !== 1 ? 's' : ''}` : ''}`
                  )}
                </button>

                {estimate && (estimate.totalCost || 0) > credits && (
                  <div className="insufficient-notice">
                    Insufficient credits — need ${((estimate.totalCost || 0) - credits).toFixed(2)} more
                  </div>
                )}
              </div>
            </>
          ) : currentModel.category === 'text' ? (
            <>
              <div className="card-header">
                <h3>Text Generation</h3>
                {textEstimate && (
                  <span className="prompt-badge">{textEstimate.totalTokens} tokens</span>
                )}
              </div>

              <div className="card-body">
                {/* Text Prompt Input */}
                <div className="form-group">
                  <label>Prompt</label>
                  <textarea
                    className="prompts-input"
                    placeholder="Enter your prompt...

Example: Explain quantum computing in simple terms.
Example: Write a function to sort an array in Python."
                    value={textPrompt}
                    onChange={(e) => setTextPrompt(e.target.value)}
                    rows={6}
                  />
                </div>

                {/* Text Config */}
                <div className="config-row">
                  <div className="config-item">
                    <span className="config-label">Model</span>
                    <span className="config-value">{currentModel.name}</span>
                  </div>
                  <div className="config-item">
                    <span className="config-label">Max Tokens</span>
                    <select 
                      className="config-select"
                      value={maxTokens} 
                      onChange={(e) => setMaxTokens(Number(e.target.value))}
                    >
                      <option value={256}>256</option>
                      <option value={512}>512</option>
                      <option value={1024}>1024</option>
                      <option value={2048}>2048</option>
                    </select>
                  </div>
                  <div className="config-item">
                    <span className="config-label">Temp</span>
                    <select 
                      className="config-select"
                      value={temperature} 
                      onChange={(e) => setTemperature(Number(e.target.value))}
                    >
                      <option value={0.3}>0.3 (Precise)</option>
                      <option value={0.7}>0.7 (Balanced)</option>
                      <option value={1.0}>1.0 (Creative)</option>
                    </select>
                  </div>
                </div>

                {/* Text Estimate */}
                {textEstimate && (
                  <div className="estimate-box">
                    <div className="estimate-line">
                      <span>{textEstimate.totalTokens} tokens × {currentModel.pricing}</span>
                      <span className="estimate-total">${textEstimate.estimatedCost.toFixed(4)}</span>
                    </div>
                    {!textEstimate.available && (
                      <div className="estimate-warning">Model endpoint not configured</div>
                    )}
                  </div>
                )}

                {/* Generate Button */}
                <button 
                  className="generate-btn"
                  onClick={handleTextGenerate}
                  disabled={isGeneratingText || !textPrompt.trim() || (textEstimate && !textEstimate.available) || (textEstimate && textEstimate.estimatedCost > credits)}
                >
                  {isGeneratingText ? (
                    <span className="spinner" />
                  ) : (
                    'Generate Text'
                  )}
                </button>

                {textEstimate && textEstimate.estimatedCost > credits && (
                  <div className="insufficient-notice">
                    Insufficient credits — need ${(textEstimate.estimatedCost - credits).toFixed(4)} more
                  </div>
                )}

                {/* Response Display */}
                {textResponse && (
                  <div className="text-response">
                    <div className="response-header">
                      <span>Response</span>
                      <span className="response-stats">
                        {textResponse.usage.outputTokens} tokens · ${textResponse.usage.cost.toFixed(4)} · {textResponse.durationMs}ms
                      </span>
                    </div>
                    <div className="response-content">
                      {textResponse.output}
                    </div>
                    <button 
                      className="copy-btn"
                      onClick={() => {
                        navigator.clipboard.writeText(textResponse.output);
                        showToast('Copied to clipboard', 'success');
                      }}
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : currentModel.category === 'audio' ? (
            <>
              <div className="card-header">
                <h3>Audio Transcription</h3>
                {audioDuration > 0 && (
                  <span className="prompt-badge">{Math.floor(audioDuration / 60)}:{String(audioDuration % 60).padStart(2, '0')}</span>
                )}
              </div>

              <div className="card-body">
                {/* File Upload */}
                <div className="form-group">
                  <label>Audio File</label>
                  <div className="audio-upload-zone">
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleAudioFile}
                      id="audio-input"
                      className="audio-input"
                    />
                    <label htmlFor="audio-input" className="audio-upload-label">
                      {audioFile ? (
                        <div className="audio-file-info">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                          </svg>
                          <span className="file-name">{audioFile.name}</span>
                          <span className="file-size">({(audioFile.size / 1024 / 1024).toFixed(1)} MB)</span>
                        </div>
                      ) : (
                        <div className="upload-placeholder">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/>
                            <line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                          <span>Click to upload audio</span>
                          <span className="upload-hint">MP3, WAV, OGG, M4A</span>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                {/* Audio Config */}
                <div className="config-row">
                  <div className="config-item">
                    <span className="config-label">Model</span>
                    <span className="config-value">{currentModel.name}</span>
                  </div>
                  <div className="config-item">
                    <span className="config-label">Task</span>
                    <select 
                      className="config-select"
                      value={transcriptionTask} 
                      onChange={(e) => setTranscriptionTask(e.target.value)}
                    >
                      <option value="transcribe">Transcribe</option>
                      <option value="translate">Translate to English</option>
                    </select>
                  </div>
                  <div className="config-item">
                    <span className="config-label">Price</span>
                    <span className="config-value">{currentModel.pricing}</span>
                  </div>
                </div>

                {/* Audio Estimate */}
                {audioEstimate && (
                  <div className="estimate-box">
                    <div className="estimate-line">
                      <span>{audioEstimate.durationMinutes} min × {currentModel.pricing}</span>
                      <span className="estimate-total">${audioEstimate.estimatedCost.toFixed(4)}</span>
                    </div>
                    {!audioEstimate.available && (
                      <div className="estimate-warning">Model endpoint not configured</div>
                    )}
                  </div>
                )}

                {/* Transcribe Button */}
                <button 
                  className="generate-btn"
                  onClick={handleTranscribe}
                  disabled={isTranscribing || !audioFile || (audioEstimate && !audioEstimate.available) || (audioEstimate && audioEstimate.estimatedCost > credits)}
                >
                  {isTranscribing ? (
                    <span className="spinner" />
                  ) : (
                    'Transcribe Audio'
                  )}
                </button>

                {audioEstimate && audioEstimate.estimatedCost > credits && (
                  <div className="insufficient-notice">
                    Insufficient credits — need ${(audioEstimate.estimatedCost - credits).toFixed(4)} more
                  </div>
                )}

                {/* Transcript Result */}
                {transcriptResult && (
                  <div className="text-response">
                    <div className="response-header">
                      <span>Transcript</span>
                      <span className="response-stats">
                        {transcriptResult.usage.durationMinutes} min · ${transcriptResult.usage.cost.toFixed(4)} · {transcriptResult.durationMs}ms
                      </span>
                    </div>
                    <div className="response-content">
                      {transcriptResult.transcript}
                    </div>
                    <button 
                      className="copy-btn"
                      onClick={() => {
                        navigator.clipboard.writeText(transcriptResult.transcript);
                        showToast('Copied to clipboard', 'success');
                      }}
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="card-body">
              <div className="coming-soon-message">
                <h4>{currentModel.name}</h4>
                <p>Coming soon. This model is not yet available.</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: History Card */}
        <div className="history-card">
          <div className="card-header">
            <h3>History</h3>
            {currentModel.category === 'image' && processingCount > 0 && (
              <span className="processing-badge">{processingCount} processing</span>
            )}
          </div>

          <div className="card-body">
            {currentModel.category === 'image' ? (
              // Image Jobs History
              isLoadingJobs ? (
                <div className="loading-state">
                  <span className="spinner" />
                  <span>Loading...</span>
                </div>
              ) : jobs.length === 0 ? (
                <div className="empty-state">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="M21 15l-5-5L5 21"/>
                  </svg>
                  <p>No jobs yet</p>
                  <span>Your generated images will appear here</span>
                </div>
              ) : (
                <div className="jobs-list">
                  {jobs.map(job => (
                    <div 
                      key={job.id} 
                      className={`job-item ${job.status} ${loadingJobId === job.id ? 'loading' : ''}`}
                      onClick={() => handleViewJob(job)}
                    >
                      <div className="job-main">
                        <span className="job-count">
                          {loadingJobId === job.id ? (
                            <span className="spinner small" />
                          ) : (
                            `${job.totalItems || job.total_items} images`
                          )}
                        </span>
                        <span className={`job-status ${job.status}`}>
                          {job.status === 'processing' && <span className="status-dot pulse" />}
                          {job.status === 'completed' && <span className="status-dot success" />}
                          {job.status === 'failed' && <span className="status-dot error" />}
                          {job.status === 'pending' && <span className="status-dot" />}
                          {job.status}
                        </span>
                      </div>
                      <div className="job-meta">
                        <span>{formatTimeAgo(job.createdAt || job.created_at)}</span>
                        <span>${parseFloat(job.totalCost || job.total_cost || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              // Inference History (Text/Audio)
              isLoadingUsage ? (
                <div className="loading-state">
                  <span className="spinner" />
                  <span>Loading...</span>
                </div>
              ) : usageHistory.filter(h => h.service === (currentModel.category === 'text' ? 'text-generation' : 'audio-transcription')).length === 0 ? (
                <div className="empty-state">
                  {currentModel.category === 'text' ? (
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                  ) : (
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                    </svg>
                  )}
                  <p>No history yet</p>
                  <span>Your {currentModel.category === 'text' ? 'text generations' : 'transcriptions'} will appear here</span>
                </div>
              ) : (
                <div className="usage-list">
                  {usageHistory
                    .filter(h => h.service === (currentModel.category === 'text' ? 'text-generation' : 'audio-transcription'))
                    .slice(0, 20)
                    .map(usage => (
                      <div key={usage.id} className="usage-item">
                        <div className="usage-main">
                          <span className="usage-model">{usage.model}</span>
                          <span className={`usage-status ${usage.status}`}>
                            <span className="status-dot success" />
                            {usage.status}
                          </span>
                        </div>
                        <div className="usage-details">
                          {currentModel.category === 'text' ? (
                            <span>{(usage.input_tokens || 0) + (usage.output_tokens || 0)} tokens</span>
                          ) : (
                            <span>{usage.duration_seconds ? `${(usage.duration_seconds / 60).toFixed(1)} min` : '-'}</span>
                          )}
                          <span>${parseFloat(usage.cost || 0).toFixed(4)}</span>
                        </div>
                        <div className="usage-meta">
                          <span>{formatTimeAgo(usage.created_at)}</span>
                          <span>{usage.duration_ms ? `${usage.duration_ms}ms` : ''}</span>
                        </div>
                      </div>
                    ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="modal-overlay" onClick={() => setSelectedJob(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Job Results</h3>
              <button className="close-btn" onClick={() => setSelectedJob(null)}>×</button>
            </div>
            
            <div className="modal-stats">
              <div className="stat">
                <span className="stat-value">{selectedJob.completedItems || selectedJob.completed_items || 0}</span>
                <span className="stat-label">Completed</span>
              </div>
              <div className="stat">
                <span className="stat-value">{selectedJob.failedItems || selectedJob.failed_items || 0}</span>
                <span className="stat-label">Failed</span>
              </div>
              <div className="stat">
                <span className="stat-value">${parseFloat(selectedJob.totalCost || selectedJob.total_cost || 0).toFixed(2)}</span>
                <span className="stat-label">Cost</span>
              </div>
            </div>

            <div className="modal-gallery">
              {selectedJob.isLoading || selectedJob.items === null ? (
                <div className="gallery-loading">
                  <span className="spinner" />
                  <span>Loading images...</span>
                </div>
              ) : selectedJob.items?.length === 0 ? (
                <div className="gallery-empty">
                  <span>No images yet</span>
                </div>
              ) : (
                selectedJob.items?.map((item, i) => {
                  const imageUrl = item.resultUrl || item.result_url;
                  return (
                    <div key={i} className={`gallery-item ${item.status}`}>
                      {item.status === 'completed' && imageUrl ? (
                        <img 
                          src={imageUrl} 
                          alt={item.prompt}
                          onClick={() => setLightboxImage(imageUrl)}
                        />
                      ) : item.status === 'processing' ? (
                        <div className="item-processing">
                          <span className="spinner" />
                        </div>
                      ) : item.status === 'failed' ? (
                        <div className="item-failed">Failed</div>
                      ) : (
                        <div className="item-pending">Pending</div>
                      )}
                      <div className="item-prompt">{item.prompt}</div>
                    </div>
                  );
                })
              )}
            </div>

            {(selectedJob.failedItems || selectedJob.failed_items || 0) > 0 && (
              <button className="retry-btn" onClick={() => handleRetry(selectedJob.id)}>
                Retry Failed
              </button>
            )}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImage && (
        <div className="lightbox" onClick={() => setLightboxImage(null)}>
          <img src={lightboxImage} alt="Full size" />
        </div>
      )}
    </div>
  );
}

export default ServerlessPanel;
