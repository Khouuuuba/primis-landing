import { useState, useEffect, useCallback } from 'react'
import StatsBar from './StatsBar'
import GpuMarketplace from './GpuMarketplace'
import LaunchConfigurator from './LaunchConfigurator'
import InstanceList from './InstanceList'
// TrustFooter removed - not needed for now
import * as api from '../api'
import './Dashboard.css'

function Dashboard({ credits, onCreditsChange, showToast }) {
  const [gpuOfferings, setGpuOfferings] = useState([])
  const [selectedGpu, setSelectedGpu] = useState(null)
  const [instances, setInstances] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [instancesLoading, setInstancesLoading] = useState(true)
  const [backendConnected, setBackendConnected] = useState(false)

  // Fetch GPU offerings from all providers
  const fetchGpuOfferings = useCallback(async () => {
    try {
      const data = await api.getGpuOfferings()
      if (data.success && data.offerings) {
        // Transform to format expected by GpuMarketplace
        const transformed = data.offerings.map(o => ({
          id: o.id,
          name: o.gpuType,
          type: o.id,
          vram: o.vramGb,
          vcpus: o.metadata?.cpuCores || 8,
          ram: o.metadata?.ramGb ? `${o.metadata.ramGb} GB` : '32 GB',
          storage: o.metadata?.diskSpace ? `${Math.round(o.metadata.diskSpace)} GB` : '100 GB',
          marketRate: o.marketPrice,
          primisRate: o.pricePerHour,
          available: o.available ? 50 : 0,
          badge: getBadge(o),
          provider: o.provider,
          region: o.region,
          reliability: o.reliability
        }))
        setGpuOfferings(transformed)
      }
    } catch (err) {
      console.error('Failed to fetch GPU offerings:', err)
      showToast('Failed to load GPU offerings', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  // Fetch user's instances
  const fetchInstances = useCallback(async () => {
    if (!backendConnected) {
      setInstancesLoading(false)
      return
    }
    try {
      const data = await api.getInstances()
      if (data.success && data.instances) {
        setInstances(data.instances)
      }
    } catch (err) {
      console.error('Failed to fetch instances:', err)
    } finally {
      setInstancesLoading(false)
    }
  }, [backendConnected])

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    try {
      const data = await api.getTemplates()
      if (data.success && data.templates) {
        setTemplates(data.templates)
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    }
  }, [])

  // Check backend connectivity and fetch data
  useEffect(() => {
    api.checkHealth().then(result => {
      setBackendConnected(result.connected)
      if (result.connected) {
        fetchGpuOfferings()
        fetchTemplates()
      } else {
        setLoading(false)
        setInstancesLoading(false)
      }
    })
  }, [fetchGpuOfferings, fetchTemplates])

  // Fetch instances after backend check
  useEffect(() => {
    if (backendConnected) {
      fetchInstances()
    }
  }, [backendConnected, fetchInstances])

  // Refresh instances periodically (every 10 seconds for running instances)
  useEffect(() => {
    if (!backendConnected) return
    
    const hasActiveInstances = instances.some(i => 
      ['pending', 'starting', 'running'].includes(i.status)
    )
    
    if (hasActiveInstances) {
      const interval = setInterval(fetchInstances, 10000)
      return () => clearInterval(interval)
    }
  }, [backendConnected, instances, fetchInstances])

  // Get badge based on GPU characteristics
  function getBadge(gpu) {
    if (gpu.gpuType?.includes('H100') || gpu.gpuType?.includes('H200')) return 'Fastest'
    if (gpu.gpuType?.includes('A100')) return 'Popular'
    if (gpu.pricePerHour < 0.15) return 'Budget'
    if (gpu.gpuType?.includes('4090') || gpu.gpuType?.includes('5090')) return 'Value'
    if (gpu.vramGb >= 80) return 'Large Models'
    return null
  }

  // Launch instance handler
  const handleLaunchInstance = useCallback(async (config) => {
    const { gpu, templateId, name, volumeSize } = config
    
    // Estimate first hour cost
    const hourlyRate = gpu.primisRate
    if (hourlyRate > credits) {
      showToast('Insufficient credits for first hour', 'error')
      return
    }

    try {
      const result = await api.launchInstance({
        gpuId: gpu.id,
        gpuCount: 1,
        templateId: templateId || 'pytorch-2.0',
        name: name || `${gpu.name}-${Date.now().toString(36)}`,
        volumeSize: volumeSize || 20
      })

      if (result.success) {
        showToast(`Instance launching: ${result.instance.name}`, 'success')
        setSelectedGpu(null)
        // Refresh instances list
        await fetchInstances()
      } else {
        throw new Error(result.error || 'Launch failed')
      }
    } catch (err) {
      console.error('Launch error:', err)
      showToast(err.message || 'Failed to launch instance', 'error')
    }
  }, [credits, showToast, fetchInstances])

  // Stop instance
  const handleStopInstance = useCallback(async (instanceId) => {
    try {
      const result = await api.stopInstance(instanceId)
      if (result.success) {
        showToast(`Instance stopped. Runtime: ${Math.round(result.runtime / 60)}m, Cost: $${result.cost?.toFixed(2)}`, 'info')
        await fetchInstances()
      }
    } catch (err) {
      showToast(err.message || 'Failed to stop instance', 'error')
    }
  }, [showToast, fetchInstances])

  // Restart instance
  const handleRestartInstance = useCallback(async (instanceId) => {
    try {
      const result = await api.restartInstance(instanceId)
      if (result.success) {
        showToast('Instance restarting...', 'success')
        await fetchInstances()
      }
    } catch (err) {
      showToast(err.message || 'Failed to restart instance', 'error')
    }
  }, [showToast, fetchInstances])

  // Terminate instance
  const handleTerminateInstance = useCallback(async (instanceId) => {
    try {
      const result = await api.terminateInstance(instanceId)
      if (result.success) {
        showToast(`Instance terminated. Final cost: $${result.finalCost?.toFixed(2) || '0.00'}`, 'info')
        await fetchInstances()
      }
    } catch (err) {
      showToast(err.message || 'Failed to terminate instance', 'error')
    }
  }, [showToast, fetchInstances])

  // Refresh single instance
  const handleRefreshInstance = useCallback(async (instanceId) => {
    try {
      const data = await api.getInstance(instanceId)
      if (data.success && data.instance) {
        setInstances(prev => prev.map(inst => 
          inst.id === instanceId ? { ...inst, ...data.instance } : inst
        ))
      }
    } catch (err) {
      console.error('Failed to refresh instance:', err)
    }
  }, [])

  // Stats
  const runningInstances = instances.filter(i => i.status === 'running').length
  const startingInstances = instances.filter(i => ['pending', 'starting'].includes(i.status)).length
  const totalSpent = instances.reduce((acc, i) => acc + parseFloat(i.total_cost_usd || 0), 0)
  const totalSaved = instances.reduce((acc, i) => {
    // Estimate savings (market rate - primis rate) * runtime
    const runtimeHours = (i.total_runtime_seconds || 0) / 3600
    const primisRate = parseFloat(i.cost_per_hour || 0)
    const marketRate = primisRate * 1.3 // Estimate market as 30% higher
    return acc + (marketRate - primisRate) * runtimeHours
  }, 0)

  return (
    <div className="dashboard">
      <StatsBar 
        availableGpus={gpuOfferings.filter(g => g.available > 0).length}
        runningJobs={runningInstances}
        pendingJobs={startingInstances}
        completedJobs={instances.filter(i => i.status === 'terminated').length}
        totalSaved={totalSaved}
      />

      <div className="dashboard-content">
        <div className="dashboard-main">
          <GpuMarketplace 
            instances={gpuOfferings}
            selectedInstance={selectedGpu}
            onSelectInstance={setSelectedGpu}
            loading={loading}
          />
          
          <InstanceList 
            instances={instances}
            onStop={handleStopInstance}
            onRestart={handleRestartInstance}
            onTerminate={handleTerminateInstance}
            onRefresh={handleRefreshInstance}
            loading={instancesLoading}
          />
        </div>

        <div className="dashboard-sidebar">
          <LaunchConfigurator 
            selectedGpu={selectedGpu}
            templates={templates}
            credits={credits}
            onLaunch={handleLaunchInstance}
            onClear={() => setSelectedGpu(null)}
            backendConnected={backendConnected}
          />
        </div>
      </div>

{/* TrustFooter removed */}
    </div>
  )
}

export default Dashboard
