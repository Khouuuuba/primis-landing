import { useState, useEffect } from 'react'
import './BatchPanel.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// Helper to format time ago
function formatTimeAgo(dateString) {
  const date = new Date(dateString)
  const now = new Date()
  const seconds = Math.floor((now - date) / 1000)
  
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function BatchPanel({ credits, privyId, onCreditsUpdate, showToast }) {
  const [prompts, setPrompts] = useState('')
  const [template, setTemplate] = useState('sdxl')
  const [templates, setTemplates] = useState([])
  const [estimate, setEstimate] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [jobs, setJobs] = useState([])
  const [selectedJob, setSelectedJob] = useState(null)
  const [isLoadingJobs, setIsLoadingJobs] = useState(true)
  const [lightboxImage, setLightboxImage] = useState(null)

  // Fetch templates on mount
  useEffect(() => {
    fetch(`${API_URL}/batch/templates`)
      .then(r => r.json())
      .then(data => setTemplates(data.templates || []))
      .catch(err => console.error('Failed to fetch templates:', err))
  }, [])

  // Fetch user's batch jobs
  useEffect(() => {
    if (!privyId) return
    
    setIsLoadingJobs(true)
    fetch(`${API_URL}/batch/jobs`, {
      headers: { 'x-privy-id': privyId }
    })
      .then(r => r.json())
      .then(data => {
        setJobs(data.jobs || [])
        setIsLoadingJobs(false)
      })
      .catch(err => {
        console.error('Failed to fetch jobs:', err)
        setIsLoadingJobs(false)
      })
  }, [privyId])

  // Get cost estimate when prompts change
  useEffect(() => {
    const promptList = prompts.split('\n').filter(p => p.trim())
    
    if (promptList.length === 0) {
      setEstimate(null)
      return
    }

    const debounce = setTimeout(() => {
      fetch(`${API_URL}/batch/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts: promptList, template })
      })
        .then(r => r.json())
        .then(data => setEstimate(data))
        .catch(err => console.error('Estimate failed:', err))
    }, 300)

    return () => clearTimeout(debounce)
  }, [prompts, template])

  const handleSubmit = async () => {
    const promptList = prompts.split('\n').filter(p => p.trim())
    
    if (promptList.length === 0) {
      showToast('Enter at least one prompt', 'error')
      return
    }

    if (estimate && estimate.totalCost > credits) {
      showToast('Insufficient credits', 'error')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(`${API_URL}/batch/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-privy-id': privyId
        },
        body: JSON.stringify({
          prompts: promptList,
          template,
          options: {}
        })
      })

      const data = await response.json()

      if (data.success) {
        showToast(`Batch job submitted: ${promptList.length} images`, 'success')
        setPrompts('')
        setEstimate(null)
        
        // Refresh jobs list
        const jobsResponse = await fetch(`${API_URL}/batch/jobs`, {
          headers: { 'x-privy-id': privyId }
        })
        const jobsData = await jobsResponse.json()
        setJobs(jobsData.jobs || [])
        
        // Update credits
        if (onCreditsUpdate) {
          onCreditsUpdate(credits - data.job.totalCost)
        }
      } else {
        showToast(data.error || 'Failed to submit job', 'error')
      }
    } catch (err) {
      console.error('Submit failed:', err)
      showToast('Failed to submit batch job', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const viewJobDetails = async (jobId) => {
    try {
      const response = await fetch(`${API_URL}/batch/jobs/${jobId}`, {
        headers: { 'x-privy-id': privyId }
      })
      const data = await response.json()
      
      // If job just completed, refresh the jobs list too
      if (selectedJob && 
          selectedJob.job.status === 'processing' && 
          data.job.status === 'completed') {
        refreshJobs()
      }
      
      setSelectedJob(data)
    } catch (err) {
      console.error('Failed to fetch job details:', err)
    }
  }

  // Auto-refresh selected job if processing
  useEffect(() => {
    if (!selectedJob || selectedJob.job.status === 'completed' || selectedJob.job.status === 'failed') {
      return
    }

    const interval = setInterval(() => {
      viewJobDetails(selectedJob.job.id)
    }, 3000)

    return () => clearInterval(interval)
  }, [selectedJob])

  // Auto-refresh job list when there are processing jobs
  useEffect(() => {
    const hasProcessingJobs = jobs.some(j => j.status === 'processing')
    
    if (!hasProcessingJobs || !privyId) {
      return
    }

    const interval = setInterval(() => {
      refreshJobs()
    }, 5000) // Refresh every 5 seconds

    return () => clearInterval(interval)
  }, [jobs, privyId])

  const processJob = async (jobId) => {
    try {
      const response = await fetch(`${API_URL}/batch/jobs/${jobId}/process`, {
        method: 'POST',
        headers: { 'x-privy-id': privyId }
      })
      const data = await response.json()
      
      if (data.success) {
        showToast('Processing started', 'success')
        // Refresh job list
        refreshJobs()
      } else {
        showToast(data.error || 'Failed to start processing', 'error')
      }
    } catch (err) {
      console.error('Process failed:', err)
      showToast('Failed to start processing', 'error')
    }
  }

  const refreshJobs = async () => {
    const jobsResponse = await fetch(`${API_URL}/batch/jobs`, {
      headers: { 'x-privy-id': privyId }
    })
    const jobsData = await jobsResponse.json()
    setJobs(jobsData.jobs || [])
  }

  const retryJob = async (jobId) => {
    try {
      const response = await fetch(`${API_URL}/batch/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: { 'x-privy-id': privyId }
      })
      const data = await response.json()
      
      if (data.success) {
        showToast('Job reset - click Start to retry', 'success')
        refreshJobs()
        setSelectedJob(null)
      } else {
        showToast(data.error || 'Failed to retry job', 'error')
      }
    } catch (err) {
      console.error('Retry failed:', err)
      showToast('Failed to retry job', 'error')
    }
  }

  const downloadAllImages = async () => {
    if (!selectedJob?.items) return
    
    const completedItems = selectedJob.items.filter(i => i.resultUrl)
    
    for (let i = 0; i < completedItems.length; i++) {
      const item = completedItems[i]
      const link = document.createElement('a')
      link.href = item.resultUrl
      link.download = `image-${i + 1}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      // Small delay between downloads
      await new Promise(r => setTimeout(r, 200))
    }
    
    showToast(`Downloaded ${completedItems.length} images`, 'success')
  }

  const promptCount = prompts.split('\n').filter(p => p.trim()).length

  return (
    <div className="batch-panel">
      <div className="batch-header">
        <h1>Batch Image Generation</h1>
        <p>Generate multiple AI images in parallel using enterprise-grade GPU infrastructure. Enter one prompt per line for batch processing.</p>
      </div>

      <div className="batch-content">
        {/* Left: Submit Form */}
        <div className="batch-form-section">
          <div className="batch-card">
            <div className="card-header">
              <h3>New Generation</h3>
              <span className="prompt-count">{promptCount} prompt{promptCount !== 1 ? 's' : ''}</span>
            </div>

            <div className="form-group">
              <label>Model</label>
              <div className="template-selector">
                {(templates.length === 0 ? [{ id: 'sdxl', name: 'Stable Diffusion XL', description: '1024×1024 high-quality images', costPerImage: 0.01 }] : templates).map(t => (
                  <div 
                    key={t.id}
                    className={`template-option ${template === t.id ? 'selected' : ''}`}
                    onClick={() => setTemplate(t.id)}
                  >
                    <div className="template-option-header">
                      <span className="template-name">{t.name}</span>
                      <span className="template-price">${t.costPerImage.toFixed(2)}</span>
                    </div>
                    <p className="template-description">{t.description || 'High-quality image generation'}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <div className="label-row">
                <label>Prompts</label>
                <span className="char-count">{prompts.length} characters</span>
              </div>
              <textarea
                value={prompts}
                onChange={(e) => setPrompts(e.target.value)}
                placeholder="a futuristic tokyo street at night, neon lights, rain reflections&#10;portrait of a robot scientist, dramatic studio lighting, 8k&#10;cyberpunk cafe interior, moody atmosphere, volumetric fog&#10;abstract geometric art, fluid shapes, vibrant gradient colors"
                rows={8}
                className="prompts-textarea"
              />
              <p className="input-hint">Enter one prompt per line. More detailed prompts produce better results.</p>
            </div>

            {estimate && (
              <div className="estimate-box">
                <div className="estimate-row">
                  <span>Images</span>
                  <span>{estimate.itemCount}</span>
                </div>
                <div className="estimate-row">
                  <span>Cost per image</span>
                  <span>${estimate.costPerImage.toFixed(2)}</span>
                </div>
                <div className="estimate-row">
                  <span>Est. time</span>
                  <span>~{Math.ceil(estimate.estimatedTimeSeconds / 60)} min</span>
                </div>
                <div className="estimate-row total">
                  <span>Total</span>
                  <span>${estimate.totalCost.toFixed(2)}</span>
                </div>
              </div>
            )}

            <button 
              className="submit-btn"
              onClick={handleSubmit}
              disabled={isSubmitting || promptCount === 0 || (estimate && estimate.totalCost > credits)}
            >
              {isSubmitting ? 'Submitting...' : 
               estimate && estimate.totalCost > credits ? 'Insufficient Credits' :
               `Generate ${promptCount} Image${promptCount !== 1 ? 's' : ''}`}
            </button>

            {estimate && estimate.totalCost > credits && (
              <p className="insufficient-warning">
                You need ${(estimate.totalCost - credits).toFixed(2)} more in credits
              </p>
            )}
          </div>
        </div>

        {/* Right: Jobs List */}
        <div className="batch-jobs-section">
          <div className="batch-card">
            <div className="card-header">
              <h3>Job History</h3>
              {jobs.length > 0 && <span className="jobs-count">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>}
            </div>

            {isLoadingJobs ? (
              <div className="skeleton-container">
                <div className="skeleton skeleton-job"></div>
                <div className="skeleton skeleton-job"></div>
                <div className="skeleton skeleton-job"></div>
              </div>
            ) : jobs.length === 0 ? (
              <div className="no-jobs">
                <svg className="no-jobs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
                <p>No batch jobs yet</p>
                <p className="no-jobs-hint">Enter prompts on the left and click generate to create your first batch</p>
              </div>
            ) : (
              <div className="jobs-list">
                {jobs.map(job => (
                  <div 
                    key={job.id} 
                    className={`job-item ${job.status}`}
                    onClick={() => viewJobDetails(job.id)}
                  >
                    <div className="job-info">
                      <div className="job-icon">
                        {job.status === 'processing' ? (
                          <div className="job-spinner"></div>
                        ) : job.status === 'completed' ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        ) : job.status === 'failed' ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                          </svg>
                        )}
                      </div>
                      <div className="job-details">
                        <span className="job-count">{job.totalItems} image{job.totalItems !== 1 ? 's' : ''}</span>
                        <span className="job-time">{formatTimeAgo(job.createdAt)}</span>
                      </div>
                    </div>
                    <div className="job-meta">
                      {job.status === 'processing' && (
                        <div className="job-progress">
                          <div className="progress-bar">
                            <div 
                              className="progress-fill" 
                              style={{ width: `${(job.completedItems / job.totalItems) * 100}%` }}
                            ></div>
                          </div>
                          <span className="progress-text">{job.completedItems}/{job.totalItems}</span>
                        </div>
                      )}
                      <span className={`job-status ${job.status}`}>
                        {job.status === 'pending' && 'Ready'}
                        {job.status === 'processing' && 'Processing'}
                        {job.status === 'completed' && 'Complete'}
                        {job.status === 'failed' && 'Failed'}
                      </span>
                      {job.status === 'pending' && (
                        <button 
                          className="process-btn"
                          onClick={(e) => { e.stopPropagation(); processJob(job.id); }}
                        >
                          Start
                        </button>
                      )}
                      {job.status === 'failed' && (
                        <button 
                          className="retry-btn"
                          onClick={(e) => { e.stopPropagation(); retryJob(job.id); }}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Job Details Modal with Gallery */}
      {selectedJob && (
        <div className="job-modal-overlay" onClick={() => setSelectedJob(null)}>
          <div className="job-modal gallery-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Batch Results</h3>
              <div className="modal-actions">
                {selectedJob.items.some(i => i.resultUrl) && (
                  <button 
                    className="download-all-btn"
                    onClick={downloadAllImages}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download All
                  </button>
                )}
                {['failed', 'processing'].includes(selectedJob.job.status) && (
                  <button 
                    className="retry-btn"
                    onClick={() => retryJob(selectedJob.job.id)}
                  >
                    Retry Job
                  </button>
                )}
                <button className="close-btn" onClick={() => setSelectedJob(null)}>×</button>
              </div>
            </div>
            <div className="modal-content">
              <div className="job-summary">
                <div className="summary-item">
                  <span className="summary-label">Status</span>
                  <span className={`status-badge ${selectedJob.job.status}`}>
                    {selectedJob.job.status}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Progress</span>
                  <span>{selectedJob.job.completedItems}/{selectedJob.job.totalItems}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Cost</span>
                  <span>${selectedJob.job.totalCost.toFixed(2)}</span>
                </div>
              </div>

              {/* Image Gallery */}
              {selectedJob.items.some(i => i.resultUrl) && (
                <div className="results-gallery">
                  {selectedJob.items.filter(i => i.resultUrl).map((item, index) => (
                    <div key={item.id} className="gallery-item" onClick={() => setLightboxImage(item)}>
                      <img 
                        src={item.resultUrl} 
                        alt={item.prompt}
                        loading="lazy"
                      />
                      <div className="gallery-item-number">{index + 1}</div>
                      <div className="gallery-item-overlay">
                        <p className="gallery-prompt">{item.prompt}</p>
                        <div className="gallery-actions">
                          <button 
                            className="gallery-btn"
                            onClick={(e) => { e.stopPropagation(); setLightboxImage(item); }}
                          >
                            Expand
                          </button>
                          <a 
                            href={item.resultUrl} 
                            download={`image-${index + 1}.png`}
                            className="gallery-btn"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Save
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending/Processing Items */}
              {selectedJob.items.some(i => !i.resultUrl) && (
                <>
                  <h4>In Progress</h4>
                  <div className="items-list">
                    {selectedJob.items.filter(i => !i.resultUrl).map(item => (
                      <div key={item.id} className={`item-row ${item.status}`}>
                        <span className="item-prompt">{item.prompt}</span>
                        <span className={`item-status ${item.status}`}>
                          {item.status === 'pending' && 'Waiting...'}
                          {item.status === 'processing' && 'Generating...'}
                          {item.status === 'failed' && (item.error || 'Generation failed')}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImage && (
        <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightboxImage(null)}>×</button>
            <img src={lightboxImage.resultUrl} alt={lightboxImage.prompt} />
            <div className="lightbox-info">
              <p className="lightbox-prompt">{lightboxImage.prompt}</p>
              <a 
                href={lightboxImage.resultUrl} 
                download="image.png"
                className="lightbox-download"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BatchPanel
