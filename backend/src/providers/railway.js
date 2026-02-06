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
  const query = `
    query Service($serviceId: String!) {
      service(id: $serviceId) {
        id
        name
        projectId
        deployments(first: 1) {
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
  const service = await createService({
    projectId,
    name: `moltbot-${name}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    source: 'Khouuuuba/moltbot-template'
  })
  
  // Set environment variables
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
      
      // Model override: Use Sonnet instead of Opus to avoid rate limits
      // Opus has only 30k input tokens/min; Sonnet has 80k input tokens/min
      // These env vars are recognized by the Clawdbot/Moltbot framework
      SMALL_ANTHROPIC_MODEL: 'claude-sonnet-4-20250514',
      LARGE_ANTHROPIC_MODEL: 'claude-sonnet-4-20250514',
      ANTHROPIC_SMALL_MODEL: 'claude-sonnet-4-20250514',
      ANTHROPIC_LARGE_MODEL: 'claude-sonnet-4-20250514',
      
      // Route through Primis API proxy for centralized rate limiting (Sprint R2)
      // If the bot framework supports custom base URL, this enables the proxy
      ...(process.env.API_BASE_URL ? {
        ANTHROPIC_BASE_URL: `${process.env.API_BASE_URL}/api/anthropic-proxy`,
        ANTHROPIC_API_BASE_URL: `${process.env.API_BASE_URL}/api/anthropic-proxy`
      } : {}),
      
      // User-provided variables
      ...envVars
    }
  })
  
  // Generate a domain
  const domain = await generateServiceDomain(service.id, environment.id)
  
  return {
    serviceId: service.id,
    environmentId: environment.id,
    projectId,
    name: service.name,
    domain: domain ? `https://${domain}` : null
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
    'SLEEPING': 'stopped'
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
    if (!latestDeployment) return 'pending'
    
    return mapStatus(latestDeployment.status)
  } catch (error) {
    console.warn(`Failed to get service status for ${serviceId}:`, error.message)
    return null
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
