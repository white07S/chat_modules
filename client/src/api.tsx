import axios from 'axios';
import { ChartSpecData } from './types/messages';

const API_BASE_URL = 'http://localhost:3000';

export interface Agent {
  type: string;
  name: string;
  model?: string;
  modelProvider?: string;
  hasMcpServers?: boolean;
}

export interface ChatMessage {
  clientId: string;
  agentType: string;
  message: string;
  threadId?: string;
  options?: any;
}

export interface JobResponse {
  jobId: string;
  status: string;
}

export interface ThreadInfo {
  threadId: string;
  agentType: string;
  startTime: Date;
  lastActivity: Date;
}

export interface SSEEvent {
  type: string;
  jobId?: string;
  agentType?: string;
  threadId?: string;
  event?: any;
  error?: string;
  duration?: number;
  timestamp?: string;
  clientId?: string;
}

export interface PersistedThread {
  threadId: string;
  agentType: string;
  title?: string;
  lastUserMessage?: string | null;
  lastAgentMessage?: string | null;
  updatedAt: string;
}

export interface ThreadHistoryResponse {
  thread: PersistedThread;
  events: SSEEvent[];
}

export interface DashboardSummary {
  id: string;
  name: string;
  plotCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardPlot {
  id: string;
  dashboardId: string;
  title: string;
  chartSpec: ChartSpecData;
  chartOption?: ChartSpecData['option'] | null;
  agentType?: string | null;
  sourceThreadId?: string | null;
  sourceEventId?: string | null;
  layout: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DashboardDetailsResponse {
  dashboard: DashboardSummary;
  plots: DashboardPlot[];
  maxPlots: number;
}

export interface DashboardListResponse {
  dashboards: DashboardSummary[];
  maxPlots: number;
}

export interface CreatePlotRequest {
  title: string;
  chartSpec: ChartSpecData;
  chartOption?: ChartSpecData['option'] | null;
  agentType?: string | null;
  sourceThreadId?: string | null;
  sourceEventId?: string | null;
  layout?: {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  };
}

export interface UpdatePlotRequest extends Partial<CreatePlotRequest> {
  dashboardId?: string;
}

export interface SaveKnowledgeRequest {
  agentType?: string | null;
  threadId?: string | null;
  messageId?: string;
  queries: string[];
}

export interface SaveKnowledgeResponse {
  saved: number;
  duplicates?: number;
}

class ApiService {
  private axios = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Get available agents
  async getAgents(): Promise<Agent[]> {
    const response = await this.axios.get('/agents');
    return response.data.agents;
  }

  async getPersistedThreads(agentType?: string): Promise<PersistedThread[]> {
    const response = await this.axios.get('/sessions', {
      params: agentType ? { agentType } : undefined
    });
    return response.data.threads;
  }

  async getThreadHistory(threadId: string): Promise<ThreadHistoryResponse> {
    const response = await this.axios.get(`/sessions/${threadId}/events`);
    return response.data;
  }

  // Get active threads
  async getThreads(): Promise<ThreadInfo[]> {
    const response = await this.axios.get('/threads');
    return response.data.threads;
  }

  // Send chat message
  async sendMessage(message: ChatMessage): Promise<JobResponse> {
    const response = await this.axios.post('/chat', message);
    return response.data;
  }

  // Stop job
  async stopJob(jobId: string): Promise<void> {
    await this.axios.post(`/stop/${jobId}`);
  }

  // Resume thread
  async resumeThread(agentType: string, threadId: string): Promise<void> {
    await this.axios.post('/threads/resume', { agentType, threadId });
  }

  async getDashboards(): Promise<DashboardListResponse> {
    const response = await this.axios.get('/dashboards');
    return response.data;
  }

  async createDashboard(name: string): Promise<DashboardSummary> {
    const response = await this.axios.post('/dashboards', { name });
    return response.data.dashboard;
  }

  async getDashboard(dashboardId: string): Promise<DashboardDetailsResponse> {
    const response = await this.axios.get(`/dashboards/${dashboardId}`);
    return response.data;
  }

  async deleteDashboard(dashboardId: string): Promise<void> {
    await this.axios.delete(`/dashboards/${dashboardId}`);
  }

  async addPlotToDashboard(dashboardId: string, payload: CreatePlotRequest): Promise<DashboardPlot> {
    const response = await this.axios.post(`/dashboards/${dashboardId}/plots`, payload);
    return response.data.plot;
  }

  async updateDashboardPlot(dashboardId: string, plotId: string, payload: UpdatePlotRequest): Promise<DashboardPlot> {
    const response = await this.axios.put(`/dashboards/${dashboardId}/plots/${plotId}`, payload);
    return response.data.plot;
  }

  async deleteDashboardPlot(dashboardId: string, plotId: string): Promise<void> {
    await this.axios.delete(`/dashboards/${dashboardId}/plots/${plotId}`);
  }

  async saveKnowledge(payload: SaveKnowledgeRequest): Promise<SaveKnowledgeResponse> {
    const response = await this.axios.post('/knowledge', payload);
    return response.data;
  }

  // Create SSE connection
  createSSEConnection(clientId: string, agentType: string, onMessage: (event: SSEEvent) => void): EventSource {
    const eventSource = new EventSource(`${API_BASE_URL}/stream/${clientId}?agentType=${agentType}`);

    eventSource.onmessage = (event) => {
      try {
        const data: SSEEvent = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('Failed to parse SSE event:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
    };

    return eventSource;
  }
}

export const apiService = new ApiService();
