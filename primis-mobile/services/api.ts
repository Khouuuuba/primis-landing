/**
 * Primis API Service
 * Connects to the existing Railway backend
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  privyId?: string;
}

class PrimisAPI {
  private baseUrl: string;
  private privyId: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setPrivyId(id: string | null) {
    this.privyId = id;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;
    
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (this.privyId) {
      requestHeaders['x-privy-id'] = this.privyId;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // ========================
  // Moltbot / Agent endpoints
  // ========================

  async getInstances() {
    return this.request<{ instances: AgentInstance[] }>('/api/moltbot/instances');
  }

  async deployInstance(data: DeployRequest) {
    return this.request<{ instance: AgentInstance }>('/api/moltbot/deploy', {
      method: 'POST',
      body: data,
    });
  }

  async restartInstance(instanceId: string) {
    return this.request(`/api/moltbot/instances/${instanceId}/restart`, {
      method: 'POST',
    });
  }

  async getInstance(instanceId: string) {
    return this.request<{ instance: AgentInstanceDetail; logs: DeploymentLog[] }>(
      `/api/moltbot/instances/${instanceId}`
    );
  }

  async deleteInstance(instanceId: string) {
    return this.request(`/api/moltbot/instances/${instanceId}`, {
      method: 'DELETE',
    });
  }

  // ========================
  // Skills
  // ========================

  async getSkills(instanceId: string) {
    return this.request<{ skills: Skill[], stats?: SkillStats }>(`/api/skills?instanceId=${instanceId}`);
  }

  async toggleSkill(skillId: string) {
    return this.request<{ skill: Skill; message: string }>(`/api/skills/${skillId}/toggle`, {
      method: 'POST',
    });
  }

  // ========================
  // Chat (in-app agent chat)
  // ========================

  async getChatAgents() {
    return this.request<{ agents: ChatAgent[] }>('/api/chat/agents');
  }

  async sendMessage(agentId: string, message: string, history: ChatMessage[]): Promise<ChatResponse> {
    const res = await fetch(`${this.baseUrl}/api/chat/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.privyId ? { 'x-privy-id': this.privyId } : {}),
      },
      body: JSON.stringify({ agentId, message, history }),
    });

    const data = await res.json().catch(() => ({ error: 'Request failed' }));

    if (!res.ok) {
      // Attach structured error info so the UI can distinguish limit errors
      const err: any = new Error(data.error || `HTTP ${res.status}`);
      err.code = data.error; // e.g. 'message_limit_reached'
      err.remaining = data.remaining;
      err.buyUrl = data.buyUrl;
      err.userMessage = data.message; // friendly message from backend
      throw err;
    }

    return data as ChatResponse;
  }

  async getUsage() {
    return this.request<UsageResponse>('/api/chat/usage');
  }

  // ========================
  // Health
  // ========================

  async health() {
    return this.request<{ status: string }>('/api/health');
  }
}

// Types
export interface AgentInstance {
  id: string;
  name: string;
  status: 'running' | 'building' | 'deploying' | 'pending' | 'stopped' | 'error';
  ai_provider: string;
  created_at: string;
  deployed_at?: string;
  railway_service_id?: string;
  error_message?: string;
}

export interface AgentInstanceDetail extends AgentInstance {
  channels?: string[];
  url?: string;
  uptime?: string;
  subscriptionStatus?: string;
  trialEndsAt?: string;
  railway?: {
    serviceId?: string;
    environmentId?: string;
    projectId?: string;
  };
}

export interface DeploymentLog {
  event_type: string;
  message: string;
  created_at: string;
}

export interface DeployRequest {
  name: string;
  aiProvider: string;
  channels?: Record<string, any>;
  telegramBotToken?: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  content_tokens?: number;
}

export interface SkillStats {
  total: number;
  active: number;
  totalTokens: number;
  maxTokens: number;
  tokenUsage: number;
}

export interface ChatAgent {
  id: string;
  name: string;
  aiProvider: string;
  status: string;
  createdAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply: string;
  model: string;
  agentName: string;
  inputTokens?: number;
  outputTokens?: number;
  remaining?: number;
}

export interface UsageResponse {
  used: number;
  limit: number;
  bonus: number;
  remaining: number;
  total: number;
  periodStart: string;
  periodEnd: string;
}

// Singleton instance
export const api = new PrimisAPI(API_URL);
