import { useState, useEffect, useCallback } from 'react'
import StatsBar from './StatsBar'
import GpuMarketplace from './GpuMarketplace'
import JobConfigurator from './JobConfigurator'
import JobQueue from './JobQueue'
import TrustFooter from './TrustFooter'
import * as api from '../api'
import './Dashboard.css'

// GPU instances with realistic cloud pricing
const GPU_INSTANCES = [
  {
    id: 'a100-40gb',
    name: 'A100 40GB',
    type: 'gpu-a100-40',
    memory: '40 GB HBM2e',
    vram: 40,
    vcpus: 12,
    ram: '120 GB',
    storage: '512 GB NVMe',
    marketRate: 2.79,
    primisRate: 1.89,
    available: 156,
    badge: 'Popular'
  },
  {
    id: 'a100-80gb',
    name: 'A100 80GB',
    type: 'gpu-a100-80',
    memory: '80 GB HBM2e',
    vram: 80,
    vcpus: 16,
    ram: '240 GB',
    storage: '1 TB NVMe',
    marketRate: 4.19,
    primisRate: 2.85,
    available: 84,
    badge: null
  },
  {
    id: 'h100-80gb',
    name: 'H100 80GB',
    type: 'gpu-h100-80',
    memory: '80 GB HBM3',
    vram: 80,
    vcpus: 24,
    ram: '360 GB',
    storage: '2 TB NVMe',
    marketRate: 8.25,
    primisRate: 5.78,
    available: 32,
    badge: 'Fastest'
  },
  {
    id: 'l40s-48gb',
    name: 'L40S 48GB',
    type: 'gpu-l40s-48',
    memory: '48 GB GDDR6',
    vram: 48,
    vcpus: 8,
    ram: '64 GB',
    storage: '256 GB NVMe',
    marketRate: 1.89,
    primisRate: 1.29,
    available: 248,
    badge: 'Value'
  },
  {
    id: 'mi300x-192gb',
    name: 'MI300X 192GB',
    type: 'gpu-mi300x-192',
    memory: '192 GB HBM3',
    vram: 192,
    vcpus: 24,
    ram: '480 GB',
    storage: '2 TB NVMe',
    marketRate: 6.49,
    primisRate: 4.42,
    available: 24,
    badge: 'Large Models'
  }
]

function Dashboard({ credits, onCreditsChange, showToast }) {
  const [selectedInstance, setSelectedInstance] = useState(null)
  const [jobs, setJobs] = useState([])
  const [jobIdCounter, setJobIdCounter] = useState(1001)
  const [backendConnected, setBackendConnected] = useState(false)

  // Check backend connectivity on mount
  useEffect(() => {
    api.checkHealth().then(result => {
      setBackendConnected(result.connected)
    })
  }, [])

  // Simulate job progress
  useEffect(() => {
    const interval = setInterval(() => {
      setJobs(prevJobs => 
        prevJobs.map(job => {
          if (job.status === 'pending') {
            // Move to running
            if (Math.random() < 0.25) {
              return { ...job, status: 'running', progress: 0, startedAt: new Date() }
            }
          } else if (job.status === 'running') {
            const elapsed = (Date.now() - new Date(job.startedAt).getTime()) / 1000
            const duration = job.estimatedMinutes * 60
            const newProgress = Math.min(100, (elapsed / duration) * 100 + Math.random() * 2)
            
            if (newProgress >= 100) {
              return { ...job, status: 'completed', progress: 100, completedAt: new Date() }
            }
            return { ...job, progress: newProgress }
          }
          return job
        })
      )
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const handleSubmitJob = useCallback(async (jobConfig) => {
    const { instance, count, hours, workload, jobName } = jobConfig
    const cost = instance.primisRate * count * hours
    
    if (cost > credits) {
      showToast('Insufficient credits', 'error')
      return
    }

    try {
      if (backendConnected) {
        // Use real API
        const result = await api.createJob({
          name: jobName || `${workload} job`,
          gpuType: instance.type,
          gpuCount: count,
          hours,
          workloadType: workload
        })
        
        const newJob = {
          id: result.job.id,
          name: result.job.name,
          instance: instance.name,
          instanceType: instance.type,
          count,
          hours,
          workload,
          cost: result.cost,
          status: 'pending',
          progress: 0,
          estimatedMinutes: Math.ceil(hours * 60 * (0.3 + Math.random() * 0.4)),
          submittedAt: new Date()
        }
        
        setJobs(prev => [newJob, ...prev])
        onCreditsChange(-result.cost)
        showToast(`Job submitted`, 'success')
      } else {
        // Demo mode
        const newJob = {
          id: `job-${jobIdCounter}`,
          name: jobName || `${workload} job`,
          instance: instance.name,
          instanceType: instance.type,
          count,
          hours,
          workload,
          cost,
          status: 'pending',
          progress: 0,
          estimatedMinutes: Math.ceil(hours * 60 * (0.3 + Math.random() * 0.4)),
          submittedAt: new Date()
        }

        setJobs(prev => [newJob, ...prev])
        setJobIdCounter(prev => prev + 1)
        onCreditsChange(-cost)
        showToast(`Job ${newJob.id} submitted`, 'success')
      }
      
      setSelectedInstance(null)
    } catch (err) {
      showToast(err.message || 'Failed to submit job', 'error')
    }
  }, [credits, jobIdCounter, onCreditsChange, showToast, backendConnected])

  const handleTerminateJob = useCallback(async (jobId) => {
    try {
      if (backendConnected && !jobId.startsWith('job-')) {
        // Use real API for backend jobs
        const result = await api.terminateJob(jobId)
        onCreditsChange(result.refund)
        showToast(`Job terminated. $${result.refund.toFixed(2)} refunded`, 'info')
        
        setJobs(prev => prev.map(job => 
          job.id === jobId ? { ...job, status: 'terminated' } : job
        ))
      } else {
        // Demo mode
        setJobs(prev => prev.map(job => {
          if (job.id === jobId && (job.status === 'pending' || job.status === 'running')) {
            const usedFraction = job.status === 'pending' ? 0 : job.progress / 100
            const refund = job.cost * (1 - usedFraction)
            onCreditsChange(refund)
            showToast(`Job terminated. $${refund.toFixed(2)} refunded`, 'info')
            return { ...job, status: 'terminated' }
          }
          return job
        }))
      }
    } catch (err) {
      showToast(err.message || 'Failed to terminate job', 'error')
    }
  }, [onCreditsChange, showToast, backendConnected])

  // Stats
  const runningJobs = jobs.filter(j => j.status === 'running').length
  const pendingJobs = jobs.filter(j => j.status === 'pending').length
  const completedJobs = jobs.filter(j => j.status === 'completed').length
  const totalSpent = jobs.filter(j => j.status === 'completed').reduce((acc, j) => acc + j.cost, 0)
  const totalSaved = jobs.filter(j => j.status === 'completed').reduce((acc, job) => {
    const inst = GPU_INSTANCES.find(g => g.type === job.instanceType)
    if (inst) return acc + (inst.marketRate - inst.primisRate) * job.count * job.hours
    return acc
  }, 0)

  return (
    <div className="dashboard">
      <StatsBar 
        availableGpus={GPU_INSTANCES.reduce((acc, g) => acc + g.available, 0)}
        runningJobs={runningJobs}
        pendingJobs={pendingJobs}
        completedJobs={completedJobs}
        totalSaved={totalSaved}
      />

      <div className="dashboard-content">
        <div className="dashboard-main">
          <GpuMarketplace 
            instances={GPU_INSTANCES}
            selectedInstance={selectedInstance}
            onSelectInstance={setSelectedInstance}
          />
          
          <JobQueue 
            jobs={jobs}
            onTerminate={handleTerminateJob}
          />
        </div>

        <div className="dashboard-sidebar">
          <JobConfigurator 
            selectedInstance={selectedInstance}
            credits={credits}
            onSubmit={handleSubmitJob}
            onClear={() => setSelectedInstance(null)}
          />
        </div>
      </div>

      <TrustFooter />
    </div>
  )
}

export default Dashboard
