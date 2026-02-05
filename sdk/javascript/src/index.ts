/**
 * @primis/sdk - Official JavaScript/TypeScript SDK for Primis Protocol
 * 
 * @example
 * ```typescript
 * import { Primis } from '@primis/sdk';
 * 
 * const primis = new Primis({ apiKey: 'prmis_xxx' });
 * 
 * // Generate an image
 * const job = await primis.images.generate({
 *   prompt: 'A futuristic city at sunset',
 *   numImages: 1
 * });
 * ```
 */

// ============================================
// TYPES
// ============================================

export interface PrimisConfig {
  /** Your Primis API key (starts with 'prmis_') */
  apiKey: string;
  /** Base URL for the API (default: https://api.primis.ai) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// Files
export interface PrimisFile {
  name: string;
  path: string;
  size: number;
  type: string;
  folder: 'datasets' | 'models' | 'outputs';
  url: string;
  createdAt: string;
}

export interface FileListResponse {
  files: PrimisFile[];
  folderCounts: {
    datasets: number;
    models: number;
    outputs: number;
  };
  storage: {
    usedBytes: number;
    usedGB: string;
    maxBytes: number;
    maxGB: number;
    percentUsed: string;
  };
}

// Images
export interface ImageGenerateOptions {
  /** The prompt describing the image to generate */
  prompt: string;
  /** Negative prompt (what to avoid) */
  negativePrompt?: string;
  /** Number of images to generate (1-10, default: 1) */
  numImages?: number;
  /** Image width in pixels (default: 1024) */
  width?: number;
  /** Image height in pixels (default: 1024) */
  height?: number;
  /** Number of inference steps (default: 30) */
  steps?: number;
  /** Guidance scale (default: 7.5) */
  guidanceScale?: number;
  /** Random seed for reproducibility */
  seed?: number;
}

export interface ImageEstimate {
  estimatedCost: number;
  estimatedTime: number;
  gpuType: string;
}

export interface ImageJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  prompt: string;
  numImages: number;
  images?: string[];
  cost?: number;
  createdAt: string;
  completedAt?: string;
}

// Text Generation
export interface TextGenerateOptions {
  /** The prompt for text generation */
  prompt: string;
  /** Maximum tokens to generate (default: 512) */
  maxTokens?: number;
  /** Temperature for randomness (0-2, default: 0.7) */
  temperature?: number;
  /** Model to use: 'llama8b' or 'llama70b' (default: 'llama8b') */
  model?: 'llama8b' | 'llama70b';
}

export interface TextGenerateResponse {
  text: string;
  tokensGenerated: number;
  cost: number;
}

// Instances
export interface GpuInstance {
  id: string;
  name: string;
  gpuType: string;
  status: 'pending' | 'running' | 'stopped' | 'terminated';
  costPerHour: number;
  createdAt: string;
  sshHost?: string;
  sshPort?: number;
}

export interface LaunchInstanceOptions {
  /** GPU type (e.g., 'RTX 4090', 'A100') */
  gpuType: string;
  /** Instance name */
  name?: string;
  /** Docker image to use */
  dockerImage?: string;
  /** Volume size in GB */
  volumeSize?: number;
}

// API Keys
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: ('read' | 'write' | 'admin')[];
  lastUsedAt?: string;
  requestCount: number;
  createdAt: string;
  expiresAt?: string;
}

// ============================================
// HTTP CLIENT
// ============================================

class HttpClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(config: PrimisConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'http://localhost:3001';
    this.timeout = config.timeout || 30000;

    if (!this.apiKey.startsWith('prmis_')) {
      throw new Error('Invalid API key format. Keys must start with "prmis_"');
    }
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new PrimisError(
          data.error || `HTTP ${response.status}`,
          data.code || 'HTTP_ERROR',
          response.status
        );
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof PrimisError) {
        throw error;
      }
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PrimisError('Request timeout', 'TIMEOUT', 408);
      }
      
      throw new PrimisError(
        error instanceof Error ? error.message : 'Unknown error',
        'NETWORK_ERROR',
        0
      );
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}

// ============================================
// ERROR CLASS
// ============================================

export class PrimisError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'PrimisError';
    this.code = code;
    this.status = status;
  }
}

// ============================================
// RESOURCE CLASSES
// ============================================

/**
 * Files API - Upload, list, and manage files
 */
class FilesResource {
  constructor(private client: HttpClient) {}

  /**
   * List all files for the authenticated user
   */
  async list(): Promise<FileListResponse> {
    const response = await this.client.get<{ success: boolean } & FileListResponse>('/api/files');
    return response;
  }

  /**
   * Get storage usage statistics
   */
  async getUsage(): Promise<FileListResponse['storage']> {
    const response = await this.client.get<{ success: boolean; storage: FileListResponse['storage'] }>('/api/files/usage');
    return response.storage;
  }

  /**
   * Delete a file
   */
  async delete(folder: string, filename: string): Promise<void> {
    await this.client.delete(`/api/files/${folder}/${filename}`);
  }
}

/**
 * Images API - Generate images using SDXL
 */
class ImagesResource {
  constructor(private client: HttpClient) {}

  /**
   * Estimate the cost of generating images
   */
  async estimate(options: ImageGenerateOptions): Promise<ImageEstimate> {
    const response = await this.client.post<{ success: boolean } & ImageEstimate>('/api/batch/estimate', options);
    return response;
  }

  /**
   * Generate images from a prompt
   */
  async generate(options: ImageGenerateOptions): Promise<ImageJob> {
    const response = await this.client.post<{ success: boolean; job: ImageJob }>('/api/batch/generate', options);
    return response.job;
  }

  /**
   * Get the status of an image generation job
   */
  async getJob(jobId: string): Promise<ImageJob> {
    const response = await this.client.get<{ success: boolean; job: ImageJob }>(`/api/batch/jobs/${jobId}`);
    return response.job;
  }

  /**
   * List all image generation jobs
   */
  async listJobs(): Promise<ImageJob[]> {
    const response = await this.client.get<{ success: boolean; jobs: ImageJob[] }>('/api/batch/jobs');
    return response.jobs;
  }

  /**
   * Wait for a job to complete (polling)
   */
  async waitForJob(jobId: string, pollInterval = 2000, maxWait = 300000): Promise<ImageJob> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      const job = await this.getJob(jobId);
      
      if (job.status === 'completed' || job.status === 'failed') {
        return job;
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new PrimisError('Job timed out waiting for completion', 'JOB_TIMEOUT', 408);
  }
}

/**
 * Text API - Generate text using Llama models
 */
class TextResource {
  constructor(private client: HttpClient) {}

  /**
   * Estimate the cost of text generation
   */
  async estimate(options: TextGenerateOptions): Promise<{ estimatedCost: number; available: boolean }> {
    const response = await this.client.post<{ success: boolean; estimatedCost: number; available: boolean }>(
      '/api/inference/text/estimate',
      options
    );
    return response;
  }

  /**
   * Generate text from a prompt
   */
  async generate(options: TextGenerateOptions): Promise<TextGenerateResponse> {
    const response = await this.client.post<{ success: boolean; result: string; newBalance: number }>(
      '/api/inference/text/generate',
      options
    );
    return {
      text: response.result,
      tokensGenerated: 0, // TODO: Return from backend
      cost: 0, // TODO: Return from backend
    };
  }
}

/**
 * Instances API - Launch and manage GPU instances
 */
class InstancesResource {
  constructor(private client: HttpClient) {}

  /**
   * List all GPU instances
   */
  async list(): Promise<GpuInstance[]> {
    const response = await this.client.get<{ success: boolean; instances: GpuInstance[] }>('/api/instances');
    return response.instances;
  }

  /**
   * Get available GPU types and pricing
   */
  async getGpuTypes(): Promise<Array<{ id: string; name: string; vram: number; pricePerHour: number }>> {
    const response = await this.client.get<{ success: boolean; gpus: Array<{ id: string; name: string; vram: number; pricePerHour: number }> }>('/api/instances/gpus');
    return response.gpus;
  }

  /**
   * Launch a new GPU instance
   */
  async launch(options: LaunchInstanceOptions): Promise<GpuInstance> {
    const response = await this.client.post<{ success: boolean; instance: GpuInstance }>('/api/instances/launch', options);
    return response.instance;
  }

  /**
   * Stop an instance
   */
  async stop(instanceId: string): Promise<void> {
    await this.client.post(`/api/instances/${instanceId}/stop`);
  }

  /**
   * Terminate an instance
   */
  async terminate(instanceId: string): Promise<void> {
    await this.client.delete(`/api/instances/${instanceId}`);
  }
}

/**
 * API Keys API - Manage API keys (requires admin scope)
 */
class ApiKeysResource {
  constructor(private client: HttpClient) {}

  /**
   * List all API keys
   */
  async list(): Promise<ApiKey[]> {
    const response = await this.client.get<{ success: boolean; keys: ApiKey[] }>('/api/api-keys');
    return response.keys;
  }
}

// ============================================
// MAIN CLIENT
// ============================================

/**
 * Primis SDK Client
 * 
 * @example
 * ```typescript
 * const primis = new Primis({ apiKey: 'prmis_xxx' });
 * 
 * // Generate an image
 * const job = await primis.images.generate({
 *   prompt: 'A cyberpunk cityscape'
 * });
 * 
 * // Wait for completion
 * const result = await primis.images.waitForJob(job.id);
 * console.log(result.images);
 * ```
 */
export class Primis {
  private client: HttpClient;

  /** Files API - Upload, list, and manage files */
  files: FilesResource;
  
  /** Images API - Generate images using SDXL */
  images: ImagesResource;
  
  /** Text API - Generate text using Llama models */
  text: TextResource;
  
  /** Instances API - Launch and manage GPU instances */
  instances: InstancesResource;
  
  /** API Keys API - Manage API keys */
  apiKeys: ApiKeysResource;

  constructor(config: PrimisConfig) {
    this.client = new HttpClient(config);
    
    this.files = new FilesResource(this.client);
    this.images = new ImagesResource(this.client);
    this.text = new TextResource(this.client);
    this.instances = new InstancesResource(this.client);
    this.apiKeys = new ApiKeysResource(this.client);
  }

  /**
   * Get the current API configuration
   */
  getConfig(): { baseUrl: string } {
    return {
      baseUrl: (this.client as any).baseUrl,
    };
  }
}

// Default export
export default Primis;
