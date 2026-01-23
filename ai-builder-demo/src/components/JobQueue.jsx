import './JobQueue.css'

function JobQueue({ jobs, onTerminate }) {
  const activeJobs = jobs.filter(j => j.status === 'pending' || j.status === 'running')
  const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'terminated').slice(0, 5)

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDuration = (job) => {
    if (!job.startedAt) return '--'
    const start = new Date(job.startedAt)
    const end = job.completedAt ? new Date(job.completedAt) : new Date()
    const seconds = Math.floor((end - start) / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  const getStatusDisplay = (status) => {
    switch (status) {
      case 'pending': return 'Pending'
      case 'running': return 'Running'
      case 'completed': return 'Completed'
      case 'terminated': return 'Terminated'
      default: return status
    }
  }

  return (
    <div className="card job-queue">
      <div className="card-header">
        <h2 className="card-title">
          <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          Jobs
        </h2>
        <span className="card-badge">
          {activeJobs.length} active
        </span>
      </div>

      {jobs.length === 0 ? (
        <div className="queue-empty">
          <p>No jobs yet</p>
          <span>Launch an instance to get started</span>
        </div>
      ) : (
        <div className="jobs-container">
          {activeJobs.length > 0 && (
            <div className="jobs-section">
              <h3 className="section-label">Active</h3>
              {activeJobs.map((job) => (
                <div key={job.id} className={`job-card ${job.status}`}>
                  <div className="job-main">
                    <div className="job-info">
                      <div className="job-title">
                        <code className="job-id">{job.id}</code>
                        <span className={`status-badge ${job.status}`}>
                          {job.status === 'running' && <span className="status-dot"></span>}
                          {getStatusDisplay(job.status)}
                        </span>
                      </div>
                      {job.name && <span className="job-name">{job.name}</span>}
                      <div className="job-meta">
                        <span>{job.count}x {job.instance}</span>
                        <span className="meta-sep">·</span>
                        <span>{job.workload}</span>
                        <span className="meta-sep">·</span>
                        <span>${job.cost.toFixed(2)}</span>
                      </div>
                    </div>

                    <button 
                      className="terminate-btn"
                      onClick={() => onTerminate(job.id)}
                    >
                      Terminate
                    </button>
                  </div>

                  {job.status === 'running' && (
                    <div className="job-progress">
                      <div className="progress-track">
                        <div 
                          className="progress-bar"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                      <div className="progress-info">
                        <span>{Math.round(job.progress)}%</span>
                        <span>{formatDuration(job)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {completedJobs.length > 0 && (
            <div className="jobs-section">
              <h3 className="section-label">Recent</h3>
              {completedJobs.map((job) => (
                <div key={job.id} className={`job-card compact ${job.status}`}>
                  <div className="job-info">
                    <div className="job-title">
                      <code className="job-id">{job.id}</code>
                      <span className={`status-badge ${job.status}`}>
                        {getStatusDisplay(job.status)}
                      </span>
                    </div>
                    <div className="job-meta">
                      <span>{job.count}x {job.instance}</span>
                      <span className="meta-sep">·</span>
                      <span>${job.cost.toFixed(2)}</span>
                    </div>
                  </div>
                  <span className="job-time">{formatTime(job.submittedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default JobQueue
