// Primis API Service for Capital Provider Demo
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

// Stakes
export async function getStakingPosition() {
  const response = await fetch(`${API_BASE}/stakes/position`, {
    headers: getHeaders()
  })
  if (!response.ok) throw new Error('Failed to get staking position')
  return response.json()
}

export async function createStake(amountSol) {
  const response = await fetch(`${API_BASE}/stakes`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ amountSol })
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to create stake')
  }
  return response.json()
}

export async function requestUnstake(stakeId) {
  const response = await fetch(`${API_BASE}/stakes/${stakeId}/unstake`, {
    method: 'POST',
    headers: getHeaders()
  })
  if (!response.ok) throw new Error('Failed to unstake')
  return response.json()
}

export async function getEarningsHistory(limit = 20) {
  const response = await fetch(`${API_BASE}/stakes/earnings/history?limit=${limit}`, {
    headers: getHeaders()
  })
  if (!response.ok) throw new Error('Failed to get earnings history')
  return response.json()
}

export async function getYieldRates() {
  const response = await fetch(`${API_BASE}/stakes/yield-rates`)
  if (!response.ok) throw new Error('Failed to get yield rates')
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
