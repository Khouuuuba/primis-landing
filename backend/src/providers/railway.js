/**
 * Railway API Provider
 * 
 * Handles all interactions with Railway's GraphQL API for Moltbot deployments.
 * 
 * Railway API: https://backboard.railway.app/graphql/v2
 * Docs: https://docs.railway.app/reference/public-api
 */

const RAILWAY_API_URL = 'https://backboard.railway.app/graphql/v2'

// Lazy getter for API key
const getApiKey = () => process.env.RAILWAY_API_KEY

// Primis project ID for Moltbot services
const getProjectId = () => process.env.RAILWAY_MOLTBOT_PROJECT_ID

/**
 * Execute GraphQL query against Railway API
 */
async function railwayQuery(query, variables = {}) {
  const apiKey = getApiKey()
  
  if (!apiKey) {
    throw new Error('RAILWAY_API_KEY environment variable is required')
  }

  const response = await fetch(RAILWAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ query, variables })
  })

  // Guard against non-JSON responses (Railway returning HTML error pages on 502/503/504)
  const contentType = response.headers.get('content-type') || ''
  if (!response.ok) {
    const bodyPreview = contentType.includes('json') 
      ? JSON.stringify(await response.json()) 
      : (await response.text()).substring(0, 200)
    console.error(`Railway API HTTP ${response.status}: ${bodyPreview}`)
    throw new Error(`Railway API returned HTTP ${response.status}. The Railway platform may be experiencing issues.`)
  }

  if (!contentType.includes('json')) {
    const bodyPreview = (await response.text()).substring(0, 200)
    console.error(`Railway API returned non-JSON (${contentType}): ${bodyPreview}`)
    throw new Error('Railway API returned non-JSON response. The Railway platform may be experiencing issues.')
  }

  const data = await response.json()
  
  if (data.errors) {
    console.error('Railway API Error:', JSON.stringify(data.errors, null, 2))
    throw new Error(data.errors[0]?.message || 'Railway API error')
  }
  
  return data.data
}

// =============================================================================
// API OPERATIONS
// =============================================================================

/**
 * Get current user's projects to verify API key works
 */
async function getMe() {
  const query = `
    query Me {
      me {
        id
        email
        name
      }
    }
  `
  return railwayQuery(query)
}

/**
 * List all projects
 */
async function listProjects() {
  const query = `
    query Projects {
      projects {
        edges {
          node {
            id
            name
            environments {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `
  const data = await railwayQuery(query)
  return data.projects.edges.map(e => ({
    id: e.node.id,
    name: e.node.name,
    environments: e.node.environments.edges.map(env => ({
      id: env.node.id,
      name: env.node.name
    }))
  }))
}

/**
 * Create a new service within a project
 * 
 * @param {Object} options
 * @param {string} options.projectId - Railway project ID
 * @param {string} options.name - Service name
 * @param {string} options.source - GitHub repo URL or Docker image
 * @returns {Promise<Object>} Created service
 */
async function createService({ projectId, name, source }) {
  const query = `
    mutation ServiceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
        name
        projectId
      }
    }
  `
  
  const variables = {
    input: {
      projectId: projectId || getProjectId(),
      name,
      source: {
        repo: source  // GitHub repo URL
      }
    }
  }
  
  const data = await railwayQuery(query, variables)
  return data.serviceCreate
}

/**
 * Create service from Docker image
 * 
 * @param {Object} options
 * @param {string} options.projectId - Railway project ID
 * @param {string} options.name - Service name
 * @param {string} options.image - Docker image (e.g., "ghcr.io/primisprotocol/moltbot:latest")
 */
async function createServiceFromImage({ projectId, name, image }) {
  const query = `
    mutation ServiceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
        name
        projectId
      }
    }
  `
  
  const variables = {
    input: {
      projectId: projectId || getProjectId(),
      name,
      source: {
        image
      }
    }
  }
  
  const data = await railwayQuery(query, variables)
  return data.serviceCreate
}

/**
 * Set environment variables for a service
 * 
 * @param {Object} options
 * @param {string} options.projectId - Railway project ID
 * @param {string} options.environmentId - Railway environment ID
 * @param {string} options.serviceId - Railway service ID
 * @param {Object} options.variables - Key-value pairs of env vars
 */
async function setServiceVariables({ projectId, environmentId, serviceId, variables }) {
  const query = `
    mutation VariableCollectionUpsert($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `
  
  const vars = {
    input: {
      projectId: projectId || getProjectId(),
      environmentId,
      serviceId,
      variables
    }
  }
  
  await railwayQuery(query, vars)
  return true
}

/**
 * Get service details including deployments
 * 
 * @param {string} serviceId - Railway service ID
 */
async function getService(serviceId) {
  // Fetch the 5 most recent deployments so we can pick the latest one
  // Railway's deployments connection may not always return newest-first with first:1
  const query = `
    query Service($serviceId: String!) {
      service(id: $serviceId) {
        id
        name
        projectId
        deployments(first: 10) {
          edges {
            node {
              id
              status
              url
              createdAt
            }
          }
        }
      }
    }
  `
  
  const data = await railwayQuery(query, { serviceId })
  
  if (data.service && data.service.deployments?.edges?.length > 1) {
    // Sort deployments by createdAt DESC to ensure we get the latest
    data.service.deployments.edges.sort((a, b) => 
      new Date(b.node.createdAt) - new Date(a.node.createdAt)
    )
  }
  
  return data.service
}

/**
 * Get deployment status
 * 
 * @param {string} deploymentId - Railway deployment ID
 */
async function getDeployment(deploymentId) {
  const query = `
    query Deployment($deploymentId: String!) {
      deployment(id: $deploymentId) {
        id
        status
        url
        createdAt
        staticUrl
        meta
      }
    }
  `
  
  const data = await railwayQuery(query, { deploymentId })
  return data.deployment
}

/**
 * Trigger a redeploy of a service
 * Uses serviceInstanceRedeploy mutation which restarts the service
 * 
 * @param {string} serviceId - Railway service ID
 * @param {string} environmentId - Railway environment ID
 */
async function redeployService(serviceId, environmentId) {
  // First try serviceInstanceRedeploy (restarts the running service)
  const query = `
    mutation ServiceInstanceRedeploy($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }
  `
  
  try {
    const data = await railwayQuery(query, { serviceId, environmentId })
    return { success: true, redeployed: data.serviceInstanceRedeploy }
  } catch (error) {
    console.error('serviceInstanceRedeploy failed, trying deploymentRedeploy:', error.message)
    
    // Fallback to deploymentRedeploy
    const fallbackQuery = `
      mutation DeploymentRedeploy($serviceId: String!, $environmentId: String!) {
        deploymentRedeploy(serviceId: $serviceId, environmentId: $environmentId) {
          id
          status
        }
      }
    `
    const data = await railwayQuery(fallbackQuery, { serviceId, environmentId })
    return data.deploymentRedeploy
  }
}

/**
 * Delete a service
 * 
 * @param {string} serviceId - Railway service ID
 */
async function deleteService(serviceId) {
  const query = `
    mutation ServiceDelete($id: String!) {
      serviceDelete(id: $id)
    }
  `
  
  await railwayQuery(query, { id: serviceId })
  return true
}

/**
 * Get service domain/URL
 * 
 * @param {string} serviceId - Railway service ID
 * @param {string} environmentId - Railway environment ID
 */
async function getServiceDomain(serviceId, environmentId) {
  const query = `
    query ServiceDomains($serviceId: String!, $environmentId: String!) {
      domains(serviceId: $serviceId, environmentId: $environmentId) {
        serviceDomains {
          domain
        }
        customDomains {
          domain
        }
      }
    }
  `
  
  const data = await railwayQuery(query, { serviceId, environmentId })
  const serviceDomains = data.domains?.serviceDomains || []
  const customDomains = data.domains?.customDomains || []
  
  // Prefer custom domain, fallback to service domain
  if (customDomains.length > 0) {
    return `https://${customDomains[0].domain}`
  }
  if (serviceDomains.length > 0) {
    return `https://${serviceDomains[0].domain}`
  }
  return null
}

/**
 * Generate a service domain (Railway auto-generates one)
 * 
 * @param {string} serviceId - Railway service ID
 * @param {string} environmentId - Railway environment ID
 */
async function generateServiceDomain(serviceId, environmentId) {
  const query = `
    mutation ServiceDomainCreate($input: ServiceDomainCreateInput!) {
      serviceDomainCreate(input: $input) {
        id
        domain
      }
    }
  `
  
  const data = await railwayQuery(query, {
    input: { serviceId, environmentId }
  })
  
  return data.serviceDomainCreate?.domain
}

// =============================================================================
// MOLTBOT-SPECIFIC HELPERS
// =============================================================================

/**
 * Deploy a new Moltbot instance
 * 
 * @param {Object} options
 * @param {string} options.name - Instance name
 * @param {Object} options.envVars - Environment variables (including secrets)
 * @returns {Promise<Object>} Deployment details
 */
async function deployMoltbot({ name, envVars }) {
  const projectId = getProjectId()
  
  if (!projectId) {
    throw new Error('RAILWAY_MOLTBOT_PROJECT_ID environment variable is required')
  }
  
  // Get the production environment ID
  const projects = await listProjects()
  const project = projects.find(p => p.id === projectId)
  
  if (!project) {
    throw new Error(`Project ${projectId} not found`)
  }
  
  const environment = project.environments.find(e => e.name === 'production')
  if (!environment) {
    throw new Error('Production environment not found in project')
  }
  
  // Create service from our Moltbot template repo
  // Railway accepts either full URL or owner/repo format
  // Add short unique suffix to prevent name collisions when redeploying same name
  const uniqueSuffix = Date.now().toString(36).slice(-4)
  const serviceName = `moltbot-${name}-${uniqueSuffix}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 60)
  
  console.log(`[deployMoltbot] Creating service: ${serviceName}`)
  const service = await createService({
    projectId,
    name: serviceName,
    source: 'Khouuuuba/moltbot-template'
  })
  
  // Generate a domain first (we need it for env vars)
  const domain = await generateServiceDomain(service.id, environment.id)
  
  // Set environment variables — MUST happen before the build starts using them
  await setServiceVariables({
    projectId,
    environmentId: environment.id,
    serviceId: service.id,
    variables: {
      // System variables
      NODE_ENV: 'production',
      CLAWDBOT_STATE_DIR: '/data',
      CLAWDBOT_PREFER_PNPM: '1',
      NODE_OPTIONS: '--max-old-space-size=1536',
      
      // Public URL — needed for webhook registration (Telegram, etc.)
      ...(domain ? { RAILWAY_PUBLIC_DOMAIN: domain, PUBLIC_URL: `https://${domain}` } : {}),
      
      // Route through Primis API proxy for centralized rate limiting (Sprint R2)
      ...(process.env.API_BASE_URL ? {
        ANTHROPIC_BASE_URL: `${process.env.API_BASE_URL}/api/anthropic-proxy`,
        ANTHROPIC_API_BASE_URL: `${process.env.API_BASE_URL}/api/anthropic-proxy`
      } : {}),
      
      // User-provided variables (ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, etc.)
      ...envVars
    }
  })
  
  // Wait briefly for Railway to propagate env vars, then trigger an explicit redeploy.
  // The createService auto-build may have started BEFORE env vars were set.
  // This redeploy ensures the build runs with all env vars in place.
  console.log(`[deployMoltbot] Waiting 3s for env var propagation...`)
  await new Promise(resolve => setTimeout(resolve, 3000))
  
  // Retry redeploy up to 3 times — this is critical for the bot to function
  let redeploySuccess = false
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[deployMoltbot] Triggering redeploy for service ${service.id} (attempt ${attempt}/3)`)
      await redeployService(service.id, environment.id)
      redeploySuccess = true
      console.log(`[deployMoltbot] Redeploy triggered successfully`)
      break
    } catch (redeployErr) {
      console.warn(`[deployMoltbot] Redeploy attempt ${attempt} failed:`, redeployErr.message)
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
  }
  
  if (!redeploySuccess) {
    console.warn(`[deployMoltbot] All redeploy attempts failed — the auto-build from createService will run but may miss env vars`)
  }
  
  return {
    serviceId: service.id,
    environmentId: environment.id,
    projectId,
    name: service.name,
    domain: domain ? `https://${domain}` : null,
    redeploySuccess
  }
}

/**
 * Map Railway deployment status to our status
 */
function mapStatus(railwayStatus) {
  const statusMap = {
    'INITIALIZING': 'deploying',
    'BUILDING': 'building',
    'DEPLOYING': 'deploying',
    'SUCCESS': 'running',
    'RUNNING': 'running',
    'CRASHED': 'failed',
    'FAILED': 'failed',
    'REMOVED': 'terminated',
    'SLEEPING': 'stopped',
    'SKIPPED': 'failed',
    'WAITING': 'building',
    'QUEUED': 'building',
    'NEEDS_APPROVAL': 'pending'
  }
  return statusMap[railwayStatus] || 'pending'
}

/**
 * Get the current status of a service (fetches latest deployment and maps status)
 * 
 * @param {string} serviceId - Railway service ID
 * @returns {string} Mapped status (running, building, deploying, failed, etc.)
 */
async function getServiceStatus(serviceId) {
  try {
    const service = await getService(serviceId)
    if (!service) return null
    
    const latestDeployment = service.deployments?.edges?.[0]?.node
    if (!latestDeployment) {
      console.log(`[getServiceStatus] ${serviceId}: no deployments found`)
      return 'pending'
    }
    
    const mapped = mapStatus(latestDeployment.status)
    console.log(`[getServiceStatus] ${serviceId}: Railway=${latestDeployment.status} → mapped=${mapped} (deployment ${latestDeployment.id}, created ${latestDeployment.createdAt})`)
    return mapped
  } catch (error) {
    console.warn(`Failed to get service status for ${serviceId}:`, error.message)
    return null
  }
}

/**
 * Get the variable names (NOT values) set on a service for diagnostics
 */
async function getServiceVariables(serviceId, environmentId, projectId) {
  const q = `
    query Variables($projectId: String!, $environmentId: String!, $serviceId: String!) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }
  `
  const data = await railwayQuery(q, { 
    projectId: projectId || getProjectId(), 
    environmentId, 
    serviceId 
  })
  // variables returns a JSON object { KEY: VALUE }
  // We only return the KEY names for security
  const vars = data.variables || {}
  return Object.keys(vars)
}

/**
 * Get deployment logs (last N lines)
 */
async function getDeploymentLogs(deploymentId, limit = 100) {
  const q = `
    query DeploymentLogs($deploymentId: String!, $limit: Int) {
      deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
        ... on Log {
          message
          timestamp
          severity
        }
      }
    }
  `
  try {
    const data = await railwayQuery(q, { deploymentId, limit })
    return data.deploymentLogs || []
  } catch (err) {
    console.warn('Failed to fetch deployment logs:', err.message)
    return []
  }
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * Check if Railway API is accessible
 */
async function healthCheck() {
  try {
    // Use projects query instead of me - works with workspace tokens
    const projects = await listProjects()
    return {
      status: 'healthy',
      provider: 'railway',
      projectCount: projects.length,
      projects: projects.map(p => p.name)
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      provider: 'railway',
      error: error.message
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Core operations
  getMe,
  listProjects,
  createService,
  createServiceFromImage,
  setServiceVariables,
  getService,
  getDeployment,
  redeployService,
  deleteService,
  getServiceDomain,
  generateServiceDomain,
  
  // Moltbot-specific
  deployMoltbot,
  mapStatus,
  getServiceStatus,
  
  // Health
  healthCheck
}

export {
  getMe,
  listProjects,
  createService,
  createServiceFromImage,
  setServiceVariables,
  getService,
  getDeployment,
  redeployService,
  deleteService,
  getServiceDomain,
  generateServiceDomain,
  deployMoltbot,
  mapStatus,
  getServiceStatus,
  healthCheck
}
