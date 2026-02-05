// Primis API Service for AI Builder Demo
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// Store the privy ID for authenticated requests
let privyId = null

export function setPrivyId(id) {
  privyId = id
}

function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  }
  if (privyId) {
    headers['x-privy-id'] = privyId
  }
  return headers
}

// Auth
export async function verifyAuth({ privyId: id, email, walletAddress }) {
  const response = await fetch(`${API_BASE}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ privyId: id, email, walletAddress })
  })
  if (!response.ok) throw new Error('Auth verification failed')
  return response.json()
}

export async function getCurrentUser() {
  const response = await fetch(`${API_BASE}/auth/me`, {
    headers: getHeaders()
  })
  if (!response.ok) throw new Error('Failed to get user')
  return response.json()
}

// Profile
export async function getProfile() {
  const response = await fetch(`${API_BASE}/users/profile`, {
    headers: getHeaders()
  })
  if (!response.ok) throw new Error('Failed to get profile')
  return response.json()
}

// ==================== INSTANCES API (New) ====================

// Get all GPU offerings from all providers (RunPod, Vast.ai, Lambda)
export async function getGpuOfferings(filters = {}) {
  const params = new URLSearchParams()
  if (filters.minVram) params.append('minVram', filters.minVram)
  if (filters.maxPrice) params.append('maxPrice', filters.maxPrice)
  if (filters.provider) params.append('provider', filters.provider)
  
  const url = `${API_BASE}/providers/gpus${params.toString() ? '?' + params : ''}`
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to get GPU offerings')
  return response.json()
}

// Get available templates (PyTorch, Stable Diffusion, etc.)
export async function getTemplates() {
  const response = await fetch(`${API_BASE}/instances/templates`)
  if (!response.ok) throw new Error('Failed to get templates')
  return response.json()
}

// Launch a new GPU instance
export async function launchInstance({ gpuId, gpuCount = 1, templateId, name, volumeSize = 20, useSpot = false }) {
  const response = await fetch(`${API_BASE}/instances/launch`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ gpuId, gpuCount, templateId, name, volumeSize, useSpot })
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to launch instance')
  }
  return response.json()
}

// Get user's instances
export async function getInstances(status = null) {
  let url = `${API_BASE}/instances`
  if (status) url += `?status=${status}`
  
  const response = await fetch(url, {
    headers: getHeaders()
  })
  if (!response.ok) throw new Error('Failed to get instances')
  return response.json()
}

// Get single instance details (includes connection info)
export async function getInstance(instanceId) {
  const response = await fetch(`${API_BASE}/instances/${instanceId}`, {
    headers: getHeaders()
  })
  if (!response.ok) throw new Error('Failed to get instance')
  return response.json()
}

// Stop an instance (pause, can restart later)
export async function stopInstance(instanceId) {
  const response = await fetch(`${API_BASE}/instances/${instanceId}/stop`, {
    method: 'POST',
    headers: getHeaders()
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to stop instance')
  }
  return response.json()
}

// Restart a stopped instance
export async function restartInstance(instanceId) {
  const response = await fetch(`${API_BASE}/instances/${instanceId}/restart`, {
    method: 'POST',
    headers: getHeaders()
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to restart instance')
  }
  return response.json()
}

// Terminate an instance (permanent, cannot restart)
export async function terminateInstance(instanceId) {
  const response = await fetch(`${API_BASE}/instances/${instanceId}/terminate`, {
    method: 'POST',
    headers: getHeaders()
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to terminate instance')
  }
  return response.json()
}

// ==================== LEGACY: GPU Instances (Old) ====================

export async function getGpuInstances() {
  const response = await fetch(`${API_BASE}/jobs/instances`)
  if (!response.ok) throw new Error('Failed to get GPU instances')
  return response.json()
}

// ==================== LEGACY: Jobs (Old) ====================
export async function getJobs(status = null, limit = 50) {
  let url = `${API_BASE}/jobs?limit=${limit}`
  if (status) url += `&status=${status}`
  
  const response = await fetch(url, {
    headers: getHeaders()
  })
  if (!response.ok) throw new Error('Failed to get jobs')
  return response.json()
}

export async function getJob(jobId) {
  const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
    headers: getHeaders()
  })
  if (!response.ok) throw new Error('Failed to get job')
  return response.json()
}

export async function createJob({ name, gpuType, gpuCount, hours, workloadType }) {
  const response = await fetch(`${API_BASE}/jobs`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name, gpuType, gpuCount, hours, workloadType })
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to create job')
  }
  return response.json()
}

export async function terminateJob(jobId) {
  const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
    method: 'DELETE',
    headers: getHeaders()
  })
  if (!response.ok) throw new Error('Failed to terminate job')
  return response.json()
}

// Credits
export async function getCreditBalance() {
  const response = await fetch(`${API_BASE}/jobs/credits/balance`, {
    headers: getHeaders()
  })
  if (!response.ok) throw new Error('Failed to get credit balance')
  return response.json()
}

export async function getCreditHistory(limit = 50) {
  const response = await fetch(`${API_BASE}/jobs/credits/history?limit=${limit}`, {
    headers: getHeaders()
  })
  if (!response.ok) throw new Error('Failed to get credit history')
  return response.json()
}

// Protocol Stats
export async function getProtocolStats() {
  const response = await fetch(`${API_BASE}/stats`)
  if (!response.ok) throw new Error('Failed to get stats')
  return response.json()
}

// Health Check
export async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`)
    const data = await response.json()
    return {
      connected: data.status === 'ok',
      ...data
    }
  } catch (error) {
    return {
      connected: false,
      error: error.message
    }
  }
}
