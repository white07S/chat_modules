import axios from 'axios';

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