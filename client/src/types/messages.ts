export type MessageType = 'user' | 'assistant' | 'system' | 'tool' | 'event' | 'conversation';

export interface TimelineEntry {
  label: string;
  content: string;
  timestamp: string;
}

export interface DbToolCall {
  id: string;
  sql?: string;
  rawResult?: string | null;
  rows: Array<Record<string, unknown>>;
  parseError?: string;
}

export interface ChartSpecData {
  rawSpec?: string | null;
  option?: Record<string, unknown> | null;
  parseError?: string;
}

export interface AgentResponseData {
  finalMessage?: string;
  dbCalls?: DbToolCall[];
  chartSpec?: ChartSpecData | null;
}

export interface Message {
  id: string;
  type: MessageType;
  content: string;
  timestamp: string;
  agentType?: string;
  metadata?: Record<string, unknown>;
  userMessage?: string;
  assistantMessage?: string;
  timeline?: TimelineEntry[];
  isStreaming?: boolean;
  agentResponse?: AgentResponseData;
}
