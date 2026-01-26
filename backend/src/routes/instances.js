/**
 * GPU Instance Provisioning API
 * 
 * Handles launching, managing, and monitoring GPU instances via multiple providers.
 * Supports: RunPod, Vast.ai, Lambda Labs
 */

import express from 'express';
import { query } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import VastAiProvider from '../providers/vastai-provider.js';

const router = express.Router();

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const VASTAI_API_KEY = process.env.VASTAI_API_KEY;
const RUNPOD_API_URL = 'https://api.runpod.io/graphql';

// ==================== GPU CATALOG ====================

// GPU types with specs and pricing (synced with RunPod)
const GPU_CATALOG = [
  {
    id: 'rtx-4090',
    name: 'RTX 4090',
    vendor: 'NVIDIA',
    vram: 24,
    vramUnit: 'GB',
    cudaCores: 16384,
    architecture: 'Ada Lovelace',
    category: 'consumer',
    tier: 'high',
    pricePerHour: 0.44,
    spotPrice: 0.34,
    available: true,
    specs: {
      fp32: '82.6 TFLOPS',
      fp16: '165.2 TFLOPS',
      memoryBandwidth: '1008 GB/s',
    },
    useCases: ['Inference', 'Fine-tuning', 'Image Generation'],
    runpodGpuId: 'NVIDIA GeForce RTX 4090',
  },
  {
    id: 'rtx-a6000',
    name: 'RTX A6000',
    vendor: 'NVIDIA',
    vram: 48,
    vramUnit: 'GB',
    cudaCores: 10752,
    architecture: 'Ampere',
    category: 'professional',
    tier: 'high',
    pricePerHour: 0.79,
    spotPrice: 0.59,
    available: true,
    specs: {
      fp32: '38.7 TFLOPS',
      fp16: '77.4 TFLOPS',
      memoryBandwidth: '768 GB/s',
    },
    useCases: ['Large Models', 'Training', 'Research'],
    runpodGpuId: 'NVIDIA RTX A6000',
  },
  {
    id: 'a100-40gb',
    name: 'A100 40GB',
    vendor: 'NVIDIA',
    vram: 40,
    vramUnit: 'GB',
    cudaCores: 6912,
    architecture: 'Ampere',
    category: 'datacenter',
    tier: 'enterprise',
    pricePerHour: 1.29,
    spotPrice: 0.89,
    available: true,
    specs: {
      fp32: '19.5 TFLOPS',
      fp16: '312 TFLOPS',
      tf32: '156 TFLOPS',
      memoryBandwidth: '1555 GB/s',
    },
    useCases: ['LLM Training', 'Large Batch', 'Enterprise'],
    runpodGpuId: 'NVIDIA A100 40GB PCIe',
  },
  {
    id: 'a100-80gb',
    name: 'A100 80GB',
    vendor: 'NVIDIA',
    vram: 80,
    vramUnit: 'GB',
    cudaCores: 6912,
    architecture: 'Ampere',
    category: 'datacenter',
    tier: 'enterprise',
    pricePerHour: 1.89,
    spotPrice: 1.49,
    available: true,
    specs: {
      fp32: '19.5 TFLOPS',
      fp16: '312 TFLOPS',
      tf32: '156 TFLOPS',
      memoryBandwidth: '2039 GB/s',
    },
    useCases: ['70B+ Models', 'Full Training', 'Research'],
    runpodGpuId: 'NVIDIA A100 80GB PCIe',
  },
  {
    id: 'h100-80gb',
    name: 'H100 80GB',
    vendor: 'NVIDIA',
    vram: 80,
    vramUnit: 'GB',
    cudaCores: 16896,
    architecture: 'Hopper',
    category: 'datacenter',
    tier: 'flagship',
    pricePerHour: 3.49,
    spotPrice: 2.49,
    available: true,
    specs: {
      fp32: '67 TFLOPS',
      fp16: '1979 TFLOPS',
      tf32: '989 TFLOPS',
      memoryBandwidth: '3350 GB/s',
    },
    useCases: ['Frontier Models', 'Maximum Performance', 'Production'],
    runpodGpuId: 'NVIDIA H100 80GB HBM3',
  },
  {
    id: 'rtx-3090',
    name: 'RTX 3090',
    vendor: 'NVIDIA',
    vram: 24,
    vramUnit: 'GB',
    cudaCores: 10496,
    architecture: 'Ampere',
    category: 'consumer',
    tier: 'mid',
    pricePerHour: 0.29,
    spotPrice: 0.22,
    available: true,
    specs: {
      fp32: '35.6 TFLOPS',
      fp16: '71.2 TFLOPS',
      memoryBandwidth: '936 GB/s',
    },
    useCases: ['Cost-effective Inference', 'Development', 'Testing'],
    runpodGpuId: 'NVIDIA GeForce RTX 3090',
  },
];

// Docker templates for quick launch
const TEMPLATES = [
  {
    id: 'pytorch-2.0',
    name: 'PyTorch 2.0 + CUDA 11.8',
    description: 'Latest PyTorch with JupyterLab and common ML libraries',
    dockerImage: 'runpod/pytorch:2.0.1-py3.10-cuda11.8.0-devel-ubuntu22.04',
    defaultPorts: '8888/http,22/tcp',
    category: 'ml',
  },
  {
    id: 'stable-diffusion',
    name: 'Stable Diffusion WebUI',
    description: 'AUTOMATIC1111 WebUI with extensions',
    dockerImage: 'runpod/stable-diffusion:web-automatic-1.0.0',
    defaultPorts: '7860/http,22/tcp',
    category: 'image',
  },
  {
    id: 'text-generation',
    name: 'Text Generation WebUI',
    description: 'Oobabooga WebUI for LLM inference',
    dockerImage: 'runpod/text-generation-webui:1.0.0',
    defaultPorts: '7860/http,5000/http,22/tcp',
    category: 'llm',
  },
  {
    id: 'jupyter-minimal',
    name: 'JupyterLab Minimal',
    description: 'Clean JupyterLab environment',
    dockerImage: 'runpod/pytorch:2.0.1-py3.10-cuda11.8.0-devel-ubuntu22.04',
    defaultPorts: '8888/http,22/tcp',
    category: 'development',
  },
  {
    id: 'comfyui',
    name: 'ComfyUI',
    description: 'Node-based Stable Diffusion workflow',
    dockerImage: 'runpod/comfyui:1.0.0',
    defaultPorts: '8188/http,22/tcp',
    category: 'image',
  },
];

// ==================== HELPER FUNCTIONS ====================

async function runpodQuery(graphqlQuery, variables = {}) {
  if (!RUNPOD_API_KEY) {
    throw new Error('RunPod API key not configured');
  }

  const response = await fetch(RUNPOD_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RUNPOD_API_KEY}`,
    },
    body: JSON.stringify({ query: graphqlQuery, variables }),
  });

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'RunPod API error');
  }
  
  return data.data;
}

async function recordInstanceEvent(instanceId, eventType, oldStatus, newStatus, details = {}) {
  await query(
    `INSERT INTO instance_events (instance_id, event_type, old_status, new_status, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [instanceId, eventType, oldStatus, newStatus, JSON.stringify(details)]
  );
}

// ==================== ROUTES ====================

// GET /api/instances/gpus - List available GPU types
router.get('/gpus', (req, res) => {
  const { category, tier, minVram } = req.query;
  
  let gpus = [...GPU_CATALOG];
  
  // Filter by category
  if (category) {
    gpus = gpus.filter(g => g.category === category);
  }
  
  // Filter by tier
  if (tier) {
    gpus = gpus.filter(g => g.tier === tier);
  }
  
  // Filter by minimum VRAM
  if (minVram) {
    gpus = gpus.filter(g => g.vram >= parseInt(minVram));
  }
  
  res.json({
    success: true,
    gpus,
    categories: ['consumer', 'professional', 'datacenter'],
    tiers: ['mid', 'high', 'enterprise', 'flagship'],
  });
});

// GET /api/instances/templates - List Docker templates
router.get('/templates', (req, res) => {
  const { category } = req.query;
  
  let templates = [...TEMPLATES];
  
  if (category) {
    templates = templates.filter(t => t.category === category);
  }
  
  res.json({
    success: true,
    templates,
    categories: ['ml', 'image', 'llm', 'development'],
  });
});

// GET /api/instances - List user's instances
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;
    
    let sql = `
      SELECT 
        i.*,
        CASE 
          WHEN i.status = 'running' AND i.started_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (NOW() - i.started_at))::INTEGER 
          ELSE i.total_runtime_seconds 
        END as runtime_seconds,
        CASE 
          WHEN i.status = 'running' AND i.started_at IS NOT NULL 
          THEN ROUND((EXTRACT(EPOCH FROM (NOW() - i.started_at)) / 3600 * i.cost_per_hour)::NUMERIC, 4)
          ELSE i.total_cost_usd 
        END as session_cost
      FROM instances i
      WHERE i.user_id = $1
    `;
    
    const params = [userId];
    
    if (status) {
      sql += ` AND i.status = $2`;
      params.push(status);
    }
    
    sql += ` ORDER BY i.created_at DESC`;
    
    const result = await query(sql, params);
    
    // Get summary stats
    const summaryResult = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'running') as running_count,
        COUNT(*) FILTER (WHERE status IN ('pending', 'starting')) as starting_count,
        COALESCE(SUM(total_cost_usd), 0) as total_spent
       FROM instances WHERE user_id = $1`,
      [userId]
    );
    
    res.json({
      success: true,
      instances: result.rows,
      summary: {
        running: parseInt(summaryResult.rows[0]?.running_count || 0),
        starting: parseInt(summaryResult.rows[0]?.starting_count || 0),
        totalSpent: parseFloat(summaryResult.rows[0]?.total_spent || 0),
      },
    });
  } catch (error) {
    console.error('Error listing instances:', error);
    res.status(500).json({ success: false, error: 'Failed to list instances' });
  }
});

// POST /api/instances/launch - Launch a new GPU instance
router.post('/launch', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      gpuId, 
      gpuCount = 1, 
      templateId = 'pytorch-2.0',
      name,
      volumeSize = 20,
      useSpot = false,
    } = req.body;
    
    // Extract provider from gpuId for routing FIRST (before any validation)
    const providerName = gpuId.split('-')[0];
    
    // ============ VAST.AI PROVIDER ROUTING (EARLY) ============
    // Vast.ai has its own GPU marketplace - skip RunPod validation entirely
    if (providerName === 'vastai') {
      if (!VASTAI_API_KEY) {
        return res.status(400).json({ 
          success: false, 
          error: 'Vast.ai integration requires API key. Please add VASTAI_API_KEY to enable.',
          providerNotReady: true
        });
      }
      
      try {
        const template = TEMPLATES.find(t => t.id === templateId);
        
        // Launch via Vast.ai provider (handles its own GPU lookup)
        const result = await VastAiProvider.launchInstance({
          name: name || `vastai-${Date.now().toString(36)}`,
          gpuOfferingId: gpuId,
          volumeGb: volumeSize,
          image: template?.dockerImage || 'pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime'
        });
        
        // Create instance record in our database
        const instanceName = name || result.name;
        const insertResult = await query(
          `INSERT INTO instances 
           (user_id, gpu_type, gpu_count, cost_per_hour, status, name, template_id, storage_gb, provider, vastai_contract_id)
           VALUES ($1, $2, $3, $4, 'starting', $5, $6, $7, 'vastai', $8)
           RETURNING id`,
          [userId, result.gpuType, result.gpuCount, result.pricePerHour, instanceName, templateId, volumeSize, result.metadata?.vastaiContractId]
        );
        
        const instanceId = insertResult.rows[0].id;
        
        return res.json({
          success: true,
          instance: {
            id: instanceId,
            vastaiId: result.id,
            name: instanceName,
            gpu: result.gpuType,
            gpuCount: result.gpuCount,
            template: template?.name || 'PyTorch',
            costPerHour: result.pricePerHour,
            status: 'starting',
            provider: 'vastai'
          }
        });
      } catch (vastError) {
        console.error('Vast.ai launch error:', vastError);
        return res.status(400).json({
          success: false,
          error: vastError.message || 'Failed to launch Vast.ai instance',
          gpuUnavailable: true
        });
      }
    }
    
    // ============ LAMBDA LABS PROVIDER (Coming Soon) ============
    if (providerName === 'lambda') {
      return res.status(400).json({ 
        success: false, 
        error: 'Lambda Labs GPU launching coming soon! For now, please select a RunPod or Vast.ai GPU.',
        providerNotReady: true
      });
    }
    
    // ============ RUNPOD PROVIDER VALIDATION ============
    // Validate GPU - support both old IDs (rtx-4090) and new provider IDs (runpod-rtx-4090)
    let gpu = GPU_CATALOG.find(g => g.id === gpuId);
    
    // If not found, try extracting from provider format (e.g., "runpod-rtx-4090")
    if (!gpu && gpuId.includes('-')) {
      // Extract GPU type from provider ID format: provider-gpu-type
      const parts = gpuId.split('-');
      const provider = parts[0]; // runpod
      const gpuType = parts.slice(1).join('-'); // rtx-4090, a100-80gb, etc.
      
      // Try to find matching GPU in catalog
      gpu = GPU_CATALOG.find(g => g.id === gpuType);
      
      // If still not found, try to match by GPU name pattern
      if (!gpu) {
        const gpuName = gpuType.toUpperCase().replace(/-/g, ' ');
        gpu = GPU_CATALOG.find(g => 
          g.name.toUpperCase().replace(/\s+/g, ' ') === gpuName ||
          g.name.toUpperCase().includes(gpuName.replace('RTX ', ''))
        );
      }
      
      // Fallback: create a dynamic GPU entry for multi-provider GPUs
      if (!gpu) {
        // Complete RunPod GPU Map - 43 GPU types
        const runpodGpuMap = {
          // AMD
          'mi300x': 'AMD Instinct MI300X OAM',
          // NVIDIA A-Series
          'a30': 'NVIDIA A30',
          'a40': 'NVIDIA A40',
          'a100-pcie': 'NVIDIA A100 80GB PCIe',
          'a100-80gb': 'NVIDIA A100 80GB PCIe',
          'a100-sxm': 'NVIDIA A100-SXM4-80GB',
          // NVIDIA B-Series
          'b200': 'NVIDIA B200',
          'b300': 'NVIDIA B300 SXM6 AC',
          // NVIDIA RTX 30 Series
          'rtx-3070': 'NVIDIA GeForce RTX 3070',
          'rtx-3080': 'NVIDIA GeForce RTX 3080',
          'rtx-3080-ti': 'NVIDIA GeForce RTX 3080 Ti',
          'rtx-3090': 'NVIDIA GeForce RTX 3090',
          'rtx-3090-ti': 'NVIDIA GeForce RTX 3090 Ti',
          // NVIDIA RTX 40 Series
          'rtx-4070-ti': 'NVIDIA GeForce RTX 4070 Ti',
          'rtx-4080': 'NVIDIA GeForce RTX 4080',
          'rtx-4080-super': 'NVIDIA GeForce RTX 4080 SUPER',
          'rtx-4090': 'NVIDIA GeForce RTX 4090',
          // NVIDIA RTX 50 Series
          'rtx-5080': 'NVIDIA GeForce RTX 5080',
          'rtx-5090': 'NVIDIA GeForce RTX 5090',
          // NVIDIA H-Series
          'h100-pcie': 'NVIDIA H100 PCIe',
          'h100-sxm': 'NVIDIA H100 80GB HBM3',
          'h100-nvl': 'NVIDIA H100 NVL',
          'h200-sxm': 'NVIDIA H200',
          'h200-nvl': 'NVIDIA H200 NVL',
          // NVIDIA L-Series
          'l4': 'NVIDIA L4',
          'l40': 'NVIDIA L40',
          'l40s': 'NVIDIA L40S',
          // NVIDIA RTX Ada Generation
          'rtx-2000-ada': 'NVIDIA RTX 2000 Ada Generation',
          'rtx-4000-ada': 'NVIDIA RTX 4000 Ada Generation',
          'rtx-4000-ada-sff': 'NVIDIA RTX 4000 SFF Ada Generation',
          'rtx-5000-ada': 'NVIDIA RTX 5000 Ada Generation',
          'rtx-6000-ada': 'NVIDIA RTX 6000 Ada Generation',
          // NVIDIA RTX A-Series (Professional)
          'rtx-a2000': 'NVIDIA RTX A2000',
          'rtx-a4000': 'NVIDIA RTX A4000',
          'rtx-a4500': 'NVIDIA RTX A4500',
          'rtx-a5000': 'NVIDIA RTX A5000',
          'rtx-a6000': 'NVIDIA RTX A6000',
          // NVIDIA RTX PRO Blackwell
          'rtx-pro-6000': 'NVIDIA RTX PRO 6000 Blackwell Server Edition',
          'rtx-pro-6000-maxq': 'NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition',
          'rtx-pro-6000-wk': 'NVIDIA RTX PRO 6000 Blackwell Workstation Edition',
          // Tesla V100
          'tesla-v100': 'Tesla V100-PCIE-16GB',
          'v100': 'Tesla V100-PCIE-16GB',
          'v100-sxm2': 'Tesla V100-SXM2-16GB',
          'v100-sxm2-32gb': 'Tesla V100-SXM2-32GB',
        };
        
        const runpodId = runpodGpuMap[gpuType];
        if (runpodId) {
          gpu = {
            id: gpuType,
            name: gpuType.toUpperCase().replace(/-/g, ' '),
            runpodGpuId: runpodId,
            pricePerHour: 0.50,  // Default price, will be overridden by actual
            spotPrice: 0.40,
            provider: provider, // Track original provider
          };
        }
      }
    }
    
    if (!gpu) {
      return res.status(400).json({ success: false, error: `Invalid GPU type: ${gpuId}` });
    }
    
    // ============ RUNPOD PROVIDER ============
    // Check real-time GPU availability on RunPod before proceeding
    try {
      const availabilityQuery = `
        query CheckAvailability($gpuId: String!) {
          gpuTypes(input: { id: $gpuId }) {
            id
            displayName
            secureCloud
            communityCloud
            lowestPrice(input: { gpuCount: ${gpuCount} }) {
              minimumBidPrice
              uninterruptablePrice
            }
          }
        }
      `;
      
      const availResult = await runpodQuery(availabilityQuery, { gpuId: gpu.runpodGpuId });
      const gpuInfo = availResult.gpuTypes?.[0];
      
      if (!gpuInfo) {
        return res.status(400).json({
          success: false,
          error: `${gpu.name} is not available on RunPod. Try RTX 4090, RTX 3090, or A40 which are usually available.`,
          gpuUnavailable: true,
          suggestedGpus: ['runpod-rtx-4090', 'runpod-rtx-3090', 'runpod-a40']
        });
      }
      
      // Check if any cloud has availability
      if (!gpuInfo.secureCloud && !gpuInfo.communityCloud) {
        return res.status(400).json({
          success: false,
          error: `${gpu.name} is currently at capacity. Try RTX 4090, RTX 3090, or A40 which typically have better availability.`,
          gpuUnavailable: true,
          suggestedGpus: ['runpod-rtx-4090', 'runpod-rtx-3090', 'runpod-a40']
        });
      }
      
      // Update price from real-time data if available
      if (gpuInfo.lowestPrice?.uninterruptablePrice) {
        gpu.pricePerHour = gpuInfo.lowestPrice.uninterruptablePrice;
      }
      if (gpuInfo.lowestPrice?.minimumBidPrice) {
        gpu.spotPrice = gpuInfo.lowestPrice.minimumBidPrice;
      }
      
    } catch (availError) {
      console.log('Availability check failed, proceeding anyway:', availError.message);
      // Continue with launch attempt even if availability check fails
    }
    
    // Validate template
    const template = TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      return res.status(400).json({ success: false, error: 'Invalid template' });
    }
    
    // Check user credits (get from credits table)
    const creditResult = await query(
      'SELECT balance_usd FROM credits WHERE user_id = $1',
      [userId]
    );
    
    const balance = parseFloat(creditResult.rows[0]?.balance_usd || 0);
    const hourlyRate = useSpot ? gpu.spotPrice : gpu.pricePerHour;
    
    // Require at least 1 hour of credits
    if (balance < hourlyRate * gpuCount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient credits',
        required: hourlyRate * gpuCount,
        balance,
      });
    }
    
    // Create instance record in pending state
    const instanceName = name || `${gpu.name}-${Date.now().toString(36)}`;
    
    const insertResult = await query(
      `INSERT INTO instances 
       (user_id, gpu_type, gpu_count, cost_per_hour, status, name, template_id, storage_gb)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
       RETURNING id`,
      [userId, gpu.name, gpuCount, hourlyRate * gpuCount, instanceName, templateId, volumeSize]
    );
    
    const instanceId = insertResult.rows[0].id;
    
    await recordInstanceEvent(instanceId, 'created', null, 'pending', { gpu, template });
    
    // Launch on RunPod
    try {
      const podInput = {
        cloudType: useSpot ? 'COMMUNITY' : 'SECURE',
        gpuCount,
        volumeInGb: volumeSize,
        containerDiskInGb: 20,
        minVcpuCount: 4,
        minMemoryInGb: 16,
        gpuTypeId: gpu.runpodGpuId,
        name: instanceName,
        imageName: template.dockerImage,
        ports: template.defaultPorts,
        volumeMountPath: '/workspace',
      };
      
      const mutation = `
        mutation createPod($input: PodFindAndDeployOnDemandInput!) {
          podFindAndDeployOnDemand(input: $input) {
            id
            machineId
            name
            desiredStatus
            runtime {
              uptimeInSeconds
              ports {
                ip
                isIpPublic
                privatePort
                publicPort
                type
              }
            }
          }
        }
      `;
      
      const result = await runpodQuery(mutation, { input: podInput });
      const pod = result.podFindAndDeployOnDemand;
      
      // Update instance with RunPod info
      await query(
        `UPDATE instances 
         SET runpod_pod_id = $1, 
             runpod_machine_id = $2, 
             status = 'starting',
             started_at = NOW()
         WHERE id = $3`,
        [pod.id, pod.machineId, instanceId]
      );
      
      await recordInstanceEvent(instanceId, 'started', 'pending', 'starting', { podId: pod.id });
      
      res.json({
        success: true,
        instance: {
          id: instanceId,
          podId: pod.id,
          name: instanceName,
          gpu: gpu.name,
          gpuCount,
          template: template.name,
          costPerHour: hourlyRate * gpuCount,
          status: 'starting',
        },
      });
    } catch (runpodError) {
      // Update instance to error state
      await query(
        `UPDATE instances SET status = 'error', status_message = $1 WHERE id = $2`,
        [runpodError.message, instanceId]
      );
      
      await recordInstanceEvent(instanceId, 'error', 'pending', 'error', { error: runpodError.message });
      
      // Provide user-friendly error messages
      let userError = runpodError.message;
      if (runpodError.message.includes('no longer any instances available')) {
        userError = `${gpu.name} is temporarily unavailable. Try a different GPU or check back in a few minutes.`;
      }
      
      return res.status(400).json({ 
        success: false, 
        error: userError,
        gpuUnavailable: true,
        suggestAlternative: true
      });
    }
  } catch (error) {
    console.error('Error launching instance:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to launch instance' });
  }
});

// GET /api/instances/:id - Get instance details
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await query(
      `SELECT * FROM instances WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    
    // If running, get fresh status from RunPod
    if (instance.runpod_pod_id && ['starting', 'running'].includes(instance.status)) {
      try {
        const podQuery = `
          query pod($podId: String!) {
            pod(input: { podId: $podId }) {
              id
              name
              desiredStatus
              runtime {
                uptimeInSeconds
                ports {
                  ip
                  isIpPublic
                  privatePort
                  publicPort
                  type
                }
                gpus {
                  id
                  gpuUtilPercent
                  memoryUtilPercent
                }
              }
            }
          }
        `;
        
        const podData = await runpodQuery(podQuery, { podId: instance.runpod_pod_id });
        const pod = podData.pod;
        
        if (pod) {
          // Update connection info
          const ports = pod.runtime?.ports || [];
          const httpPort = ports.find(p => p.type === 'http');
          const sshPort = ports.find(p => p.privatePort === 22);
          
          // Check if actually running
          const isRunning = pod.desiredStatus === 'RUNNING' && pod.runtime;
          
          if (isRunning && instance.status === 'starting') {
            await query(
              `UPDATE instances SET 
                status = 'running',
                ssh_host = $1,
                ssh_port = $2,
                jupyter_url = $3
               WHERE id = $4`,
              [
                sshPort?.ip || null,
                sshPort?.publicPort || null,
                httpPort ? `http://${httpPort.ip}:${httpPort.publicPort}` : null,
                id
              ]
            );
            instance.status = 'running';
          }
          
          instance.liveData = {
            uptime: pod.runtime?.uptimeInSeconds,
            ports: ports,
            gpus: pod.runtime?.gpus,
          };
        }
      } catch (e) {
        console.error('Error fetching pod status:', e);
      }
    }
    
    // Get events
    const eventsResult = await query(
      `SELECT * FROM instance_events WHERE instance_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [id]
    );
    
    res.json({
      success: true,
      instance,
      events: eventsResult.rows,
    });
  } catch (error) {
    console.error('Error getting instance:', error);
    res.status(500).json({ success: false, error: 'Failed to get instance' });
  }
});

// POST /api/instances/:id/stop - Stop an instance
router.post('/:id/stop', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await query(
      `SELECT * FROM instances WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    
    if (!['running', 'starting'].includes(instance.status)) {
      return res.status(400).json({ success: false, error: 'Instance is not running' });
    }
    
    // Vast.ai doesn't support stopping - only terminate
    if (instance.provider === 'vastai' || instance.vastai_contract_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Vast.ai instances cannot be stopped (paused). Use "Terminate" instead - you can launch a new instance later.',
        suggestion: 'terminate'
      });
    }
    
    // Stop on RunPod
    if (instance.runpod_pod_id) {
      const mutation = `
        mutation stopPod($podId: String!) {
          podStop(input: { podId: $podId }) {
            id
            desiredStatus
          }
        }
      `;
      
      await runpodQuery(mutation, { podId: instance.runpod_pod_id });
    }
    
    // Calculate runtime and cost
    const runtimeSeconds = instance.started_at 
      ? Math.floor((Date.now() - new Date(instance.started_at).getTime()) / 1000)
      : 0;
    const sessionCost = (runtimeSeconds / 3600) * instance.cost_per_hour;
    
    // Update instance
    await query(
      `UPDATE instances SET 
        status = 'stopped',
        stopped_at = NOW(),
        total_runtime_seconds = total_runtime_seconds + $1,
        total_cost_usd = total_cost_usd + $2
       WHERE id = $3`,
      [runtimeSeconds, sessionCost, id]
    );
    
    // Deduct credits
    await query(
      `UPDATE credits SET balance_usd = balance_usd - $1 WHERE user_id = $2`,
      [sessionCost, userId]
    );
    
    await recordInstanceEvent(id, 'stopped', instance.status, 'stopped', { 
      runtimeSeconds, 
      sessionCost 
    });
    
    res.json({
      success: true,
      message: 'Instance stopped',
      runtime: runtimeSeconds,
      cost: sessionCost,
    });
  } catch (error) {
    console.error('Error stopping instance:', error);
    res.status(500).json({ success: false, error: 'Failed to stop instance' });
  }
});

// POST /api/instances/:id/terminate - Terminate an instance
router.post('/:id/terminate', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await query(
      `SELECT * FROM instances WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    
    if (instance.status === 'terminated') {
      return res.status(400).json({ success: false, error: 'Instance already terminated' });
    }
    
    // Terminate on the appropriate provider
    try {
      // Terminate on RunPod
      if (instance.runpod_pod_id) {
        console.log(`Terminating RunPod pod: ${instance.runpod_pod_id}`);
        const mutation = `
          mutation terminatePod($podId: String!) {
            podTerminate(input: { podId: $podId })
          }
        `;
        await runpodQuery(mutation, { podId: instance.runpod_pod_id });
      }
      
      // Terminate on Vast.ai
      if (instance.vastai_contract_id || instance.provider === 'vastai') {
        const contractId = instance.vastai_contract_id;
        if (contractId) {
          console.log(`Terminating Vast.ai contract: ${contractId}`);
          await VastAiProvider.terminateInstance(contractId);
        }
      }
    } catch (providerError) {
      console.error('Provider termination error (continuing anyway):', providerError.message);
      // Continue with local termination even if provider call fails
    }
    
    // Calculate final cost if was running
    let finalCost = 0;
    if (instance.status === 'running' && instance.started_at) {
      const runtimeSeconds = Math.floor((Date.now() - new Date(instance.started_at).getTime()) / 1000);
      finalCost = (runtimeSeconds / 3600) * instance.cost_per_hour;
      
      await query(
        `UPDATE credits SET balance_usd = balance_usd - $1 WHERE user_id = $2`,
        [finalCost, userId]
      );
    }
    
    // Update instance
    await query(
      `UPDATE instances SET 
        status = 'terminated',
        terminated_at = NOW(),
        total_cost_usd = total_cost_usd + $1
       WHERE id = $2`,
      [finalCost, id]
    );
    
    await recordInstanceEvent(id, 'terminated', instance.status, 'terminated', { finalCost });
    
    res.json({
      success: true,
      message: 'Instance terminated',
      finalCost,
    });
  } catch (error) {
    console.error('Error terminating instance:', error);
    res.status(500).json({ success: false, error: 'Failed to terminate instance' });
  }
});

// POST /api/instances/:id/restart - Restart a stopped instance
router.post('/:id/restart', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    const result = await query(
      `SELECT * FROM instances WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    
    if (instance.status !== 'stopped') {
      return res.status(400).json({ success: false, error: 'Instance is not stopped' });
    }
    
    // Check credits
    const creditResult = await query(
      'SELECT balance_usd FROM credits WHERE user_id = $1',
      [userId]
    );
    
    const balance = parseFloat(creditResult.rows[0]?.balance_usd || 0);
    if (balance < instance.cost_per_hour) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient credits',
        required: instance.cost_per_hour,
        balance,
      });
    }
    
    // Resume on RunPod
    if (instance.runpod_pod_id) {
      const mutation = `
        mutation resumePod($podId: String!) {
          podResume(input: { podId: $podId }) {
            id
            desiredStatus
          }
        }
      `;
      
      await runpodQuery(mutation, { podId: instance.runpod_pod_id });
    }
    
    // Update instance
    await query(
      `UPDATE instances SET 
        status = 'starting',
        started_at = NOW()
       WHERE id = $1`,
      [id]
    );
    
    await recordInstanceEvent(id, 'restarted', 'stopped', 'starting', {});
    
    res.json({
      success: true,
      message: 'Instance restarting',
    });
  } catch (error) {
    console.error('Error restarting instance:', error);
    res.status(500).json({ success: false, error: 'Failed to restart instance' });
  }
});

export default router;
