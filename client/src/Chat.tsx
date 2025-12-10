import React, { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { apiService, Agent, SSEEvent, PersistedThread } from './api';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { Message } from './types/messages';
import { collectTextFromToolContent, parseChartSpec, parseSqlResult, safeJsonParse } from './utils/parsers';
import { ThreadSidebar } from './components/ThreadSidebar';

export const Chat: React.FC = () => {
  // Event type labels mapping (1-2 words each)
  const getEventLabel = (eventType: string, subType?: string): string => {
    // Handle composite events with subtypes
    if (subType) {
      const compositeKey = `${eventType}.${subType}`;
      switch (compositeKey) {
        case 'event_msg.agent_message': return 'Assistant';
        case 'event_msg.user_message': return 'User Input';
        case 'event_msg.token_count': return 'Tokens';
        case 'response_item.message': return 'Message';
        case 'response_item.function_call': return 'Tool Call';
        case 'response_item.function_call_output': return 'Tool Result';
        default: break;
      }
    }

    // Main event types
    switch (eventType) {
      // Session and thread events
      case 'session_meta': return 'Session';
      case 'thread.started': return 'Thread Start';
      case 'thread.completed': return 'Thread End';
      case 'turn.started': return 'Processing';
      case 'turn.completed': return 'Complete';

      // Item lifecycle events
      case 'item.created': return 'Creating';
      case 'item.started': return 'Starting';
      case 'item.streaming': return 'Streaming';
      case 'item.completed': return 'Finished';

      // Context and state events
      case 'turn_context': return 'Context';
      case 'ghost_snapshot': return 'Snapshot';

      // SSE-level events
      case 'connected': return 'Connected';
      case 'thread_info': return 'Thread Info';
      case 'job_complete': return 'Job Done';
      case 'job_stopped': return 'Stopped';
      case 'error': return 'Error';

      // Default for unknown events
      default: return eventType.split('.').pop()?.toUpperCase() || 'Event';
    }
  };

  // State
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('chit_chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [clientId] = useState(() => uuidv4());
  const [currentConversationId, setCurrentConversationIdState] = useState<string | null>(null);
  const [persistedThreads, setPersistedThreads] = useState<PersistedThread[]>([]);
  const [threadFilterAgent, setThreadFilterAgent] = useState<string>('all');
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [newThreadAgent, setNewThreadAgent] = useState<string>('chit_chat');

  const eventSourceRef = useRef<EventSource | null>(null);
  const isConnectedRef = useRef(false);
  const currentConversationRef = useRef<string | null>(null);
  const threadFilterRef = useRef<string>('all');

  const setActiveConversationId = (conversationId: string | null) => {
    currentConversationRef.current = conversationId;
    setCurrentConversationIdState(conversationId);
  };

  useEffect(() => {
    currentConversationRef.current = currentConversationId;
  }, [currentConversationId]);

  useEffect(() => {
    setNewThreadAgent(selectedAgent);
  }, [selectedAgent]);

  const addMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const addSystemMessage = useCallback((content: string, type: 'system' | 'error' = 'system') => {
    addMessage({
      id: uuidv4(),
      type: 'system',
      content,
      timestamp: new Date().toISOString(),
    });
  }, [addMessage]);

  // Load agents on mount
  useEffect(() => {
    loadAgents();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connect SSE when agent changes
  useEffect(() => {
    connectSSE();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent]);

  const loadAgents = async () => {
    try {
      const agentList = await apiService.getAgents();
      setAgents(agentList);
      if (agentList.length > 0 && !agentList.find(a => a.type === selectedAgent)) {
        setSelectedAgent(agentList[0].type);
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
      addSystemMessage('Failed to load agents. Check server connection.');
    }
  };

  const loadPersistedThreads = useCallback(async (agentFilter?: string) => {
    try {
      const threads = await apiService.getPersistedThreads(agentFilter);
      setPersistedThreads(threads);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      addSystemMessage('Failed to load saved threads.');
    }
  }, [addSystemMessage]);

  useEffect(() => {
    threadFilterRef.current = threadFilterAgent;
    const filterValue = threadFilterAgent === 'all' ? undefined : threadFilterAgent;
    loadPersistedThreads(filterValue);
  }, [threadFilterAgent, loadPersistedThreads]);

  const connectSSE = () => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      isConnectedRef.current = false;
    }

    // Create new SSE connection
    const eventSource = apiService.createSSEConnection(clientId, selectedAgent, handleSSEMessage);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      isConnectedRef.current = true;
      addSystemMessage(`Connected to ${selectedAgent} agent`);
    };

    eventSource.onerror = () => {
      isConnectedRef.current = false;
      addSystemMessage('Connection lost. Reconnecting...');
    };
  };

  const handleSSEMessage = (event: SSEEvent) => {
    switch (event.type) {
      case 'connected':
        isConnectedRef.current = true;
        break;

      case 'thread_info':
        setCurrentThreadId(event.threadId || null);
        addSystemMessage(`Thread: ${event.threadId}`);
        break;

      case 'agent_event':
        handleAgentEvent(event);
        break;

      case 'job_complete':
        setIsProcessing(false);
        setCurrentJobId(null);
        if (currentConversationRef.current && event.duration) {
          addTimelineEvent('Job Done', `${event.duration}ms`, currentConversationRef.current);
        }
        setActiveConversationId(null);
        if (!isHistoryLoading) {
          refreshPersistedThreads();
        }
        break;

      case 'error':
        setIsProcessing(false);
        setCurrentJobId(null);
        if (currentConversationRef.current) {
          updateConversation({
            assistantMessage: `Error: ${event.error}`,
            isStreaming: false
          }, currentConversationRef.current);
          setActiveConversationId(null);
        } else {
          addSystemMessage(`Error: ${event.error}`, 'error');
        }
        break;
    }
  };

  type ConversationUpdate = Partial<Message> | ((message: Message) => Message);

  const updateConversation = (updates: ConversationUpdate, conversationId?: string | null) => {
    const targetConversationId = conversationId ?? currentConversationRef.current;
    if (!targetConversationId) return;

    setMessages(prev => {
      const lastIndex = prev.findIndex(msg => msg.id === targetConversationId);
      if (lastIndex === -1) return prev;

      const newMessages = [...prev];
      const currentMessage = newMessages[lastIndex];

      const updatedMessage = typeof updates === 'function'
        ? updates(currentMessage)
        : {
            ...currentMessage,
            ...updates,
            agentResponse: updates.agentResponse
              ? {
                  ...currentMessage.agentResponse,
                  ...updates.agentResponse
                }
              : currentMessage.agentResponse,
            timeline: updates.timeline
              ? [
                  ...(currentMessage.timeline || []),
                  ...updates.timeline
                ]
              : currentMessage.timeline
          };

      newMessages[lastIndex] = updatedMessage;
      return newMessages;
    });
  };

  const addTimelineEvent = (label: string, content: string, conversationId?: string | null) => {
    const targetConversationId = conversationId ?? currentConversationRef.current;
    if (!targetConversationId) return;

    updateConversation({
      timeline: [{
        label,
        content,
        timestamp: new Date().toISOString()
      }]
    }, targetConversationId);
  };

  const extractSqlQuery = (args: unknown): string => {
    if (!args) {
      return '';
    }

    if (typeof args === 'string') {
      const parsed = safeJsonParse<{ sql?: string; query?: string }>(args);
      if (parsed) {
        if (typeof parsed.sql === 'string') return parsed.sql;
        if (typeof parsed.query === 'string') return parsed.query;
      }
      return args;
    }

    if (typeof args === 'object') {
      const record = args as Record<string, unknown>;
      const sqlCandidate = record.sql ?? record.query;
      if (typeof sqlCandidate === 'string') {
        return sqlCandidate;
      }
    }

    return '';
  };

  const handleSqlToolResult = (item: any) => {
    const conversationId = currentConversationRef.current;
    if (!conversationId) {
      return;
    }

    const resultText = collectTextFromToolContent(item?.result?.content);
    const parsedResult = parseSqlResult(resultText);
    const sqlQuery = extractSqlQuery(item?.arguments);
    const callId = item?.id || `sql_${Date.now()}`;

    updateConversation((current) => ({
      ...current,
      agentResponse: {
        ...current.agentResponse,
        dbCalls: [
          ...(current.agentResponse?.dbCalls || []),
          {
            id: callId,
            sql: sqlQuery,
            rawResult: resultText,
            rows: parsedResult.rows,
            parseError: parsedResult.error
          }
        ]
      }
    }), conversationId);
  };

  const handleChartToolResult = (item: any) => {
    const conversationId = currentConversationRef.current;
    if (!conversationId) {
      return;
    }

    const specText = collectTextFromToolContent(item?.result?.content);
    const parsedSpec = parseChartSpec(specText);

    updateConversation((current) => ({
      ...current,
      agentResponse: {
        ...current.agentResponse,
        chartSpec: {
          rawSpec: specText,
          option: parsedSpec.option,
          parseError: parsedSpec.error
        }
      }
    }), conversationId);
  };

  const handleToolCallCompletion = (item: any) => {
    if (!item || item.status !== 'completed') {
      return;
    }

    if (item.tool === 'execute_sql') {
      handleSqlToolResult(item);
    } else if (item.tool === 'generate_chart') {
      handleChartToolResult(item);
    }
  };

  const handleAgentEvent = (event: SSEEvent) => {
    if (!event.event) return;

    const agentEvent = event.event;

    switch (agentEvent.type) {
      // Session and thread events
      case 'session_meta':
        addTimelineEvent(getEventLabel('session_meta'), `Session: ${agentEvent.payload?.id?.slice(-8) || 'started'}`);
        break;

      case 'thread.started':
        addTimelineEvent(getEventLabel('thread.started'), `Thread: ${agentEvent.thread_id?.slice(-8) || 'new'}`);
        break;

      case 'turn.started':
        // Start a new conversation when turn starts
        if (!currentConversationRef.current) {
          const convId = uuidv4();
          setActiveConversationId(convId);
          const newConversation: Message = {
            id: convId,
            type: 'conversation',
            content: '',
            timestamp: new Date().toISOString(),
            agentType: selectedAgent,
            userMessage: '',
            assistantMessage: '',
            timeline: [],
            isStreaming: true
          };
          setMessages(prev => [...prev, newConversation]);
        }
        addTimelineEvent(getEventLabel('turn.started'), 'Processing...');
        break;

      // Response streaming events - these come as content is generated
      case 'response_item':
        if (agentEvent.payload?.type === 'message') {
          if (agentEvent.payload.role === 'user') {
            const content = agentEvent.payload.content?.[0];
            if (content?.text) {
              updateConversation((current) => {
                if (current.userMessage && current.userMessage.length > 0) {
                  return current;
                }
                return {
                  ...current,
                  userMessage: content.text,
                  agentType: current.agentType || selectedAgent
                };
              }, currentConversationRef.current);
            }
          } else if (agentEvent.payload.role === 'assistant') {
            const content = agentEvent.payload.content?.[0];
            if (content?.text) {
              updateConversation({
                assistantMessage: content.text,
                isStreaming: true
              }, currentConversationRef.current);
            }
          }
        } else if (agentEvent.payload?.type === 'function_call') {
          addTimelineEvent('Tool Call', `🔧 ${agentEvent.payload.name}`);
        } else if (agentEvent.payload?.type === 'function_call_output') {
          addTimelineEvent('Tool Result', '✅ Received');
        }
        break;

      // Event messages - various types of updates
      case 'event_msg':
        if (agentEvent.payload?.type === 'agent_message') {
          // This is the actual text being streamed
          updateConversation({
            assistantMessage: agentEvent.payload.message,
            isStreaming: true
          }, currentConversationRef.current);
        } else if (agentEvent.payload?.type === 'user_message') {
          // Skip user message echo in timeline
        } else if (agentEvent.payload?.type === 'token_count' && agentEvent.payload.info?.total_token_usage) {
          const usage = agentEvent.payload.info.total_token_usage;
          addTimelineEvent('Tokens', `In: ${usage.input_tokens}, Out: ${usage.output_tokens}`);
        }
        break;

      // Item events - creation, starting, streaming, and completion
      case 'item.created':
        if (agentEvent.item?.type) {
          addTimelineEvent(getEventLabel('item.created'), `${agentEvent.item.type}`);
        }
        break;

      case 'item.started':
        // Command execution or tool call started
        if (agentEvent.item?.type === 'command_execution') {
          addTimelineEvent('Command', `⚡ ${agentEvent.item.command}`);
        } else if (agentEvent.item?.type === 'function_call') {
          addTimelineEvent('Tool Start', `🔧 ${agentEvent.item.name}`);
        } else if (agentEvent.item?.type === 'mcp_tool_call') {
          const toolLabel = agentEvent.item?.tool || 'MCP Tool';
          addTimelineEvent('Tool Start', `🔧 ${toolLabel}`);
        }
        break;

      case 'item.streaming':
        // This is where partial content comes through during streaming
        const activeConversationId = currentConversationRef.current;
        if (agentEvent.item?.content && activeConversationId) {
          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === activeConversationId);
            if (idx === -1) return prev;

            const newMessages = [...prev];
            const existingContent = newMessages[idx].assistantMessage || '';
            newMessages[idx] = {
              ...newMessages[idx],
              assistantMessage: existingContent + agentEvent.item.content,
              isStreaming: true
            };
            return newMessages;
          });
        }
        break;

      case 'item.completed':
        if (agentEvent.item?.type === 'agent_message' && agentEvent.item?.text) {
          // Final complete message
          updateConversation({
            assistantMessage: agentEvent.item.text,
            agentResponse: {
              finalMessage: agentEvent.item.text
            },
            isStreaming: false
          }, currentConversationRef.current);
        } else if (agentEvent.item?.type === 'command_execution') {
          addTimelineEvent('Command Done', `✅ ${agentEvent.item.command}`);
        } else if (agentEvent.item?.type === 'function_call') {
          addTimelineEvent('Tool Done', `✅ ${agentEvent.item.name}`);
        } else if (agentEvent.item?.type === 'mcp_tool_call') {
          const toolLabel = agentEvent.item?.tool || 'MCP Tool';
          addTimelineEvent('Tool Done', `✅ ${toolLabel}`);
          handleToolCallCompletion(agentEvent.item);
        }
        break;

      // Turn completion
      case 'turn.completed':
        if (agentEvent.usage) {
          addTimelineEvent(getEventLabel('turn.completed'), `Tokens: ${agentEvent.usage.input_tokens}/${agentEvent.usage.output_tokens}`);
        }
        updateConversation({ isStreaming: false }, currentConversationRef.current);
        break;

      // Context and other events
      case 'turn_context':
        // Skip context events in timeline for cleaner view
        break;

      case 'ghost_snapshot':
        addTimelineEvent(getEventLabel('ghost_snapshot'), 'Snapshot taken');
        break;

      default:
        // Add unknown events to timeline
        addTimelineEvent(getEventLabel(agentEvent.type), 'Event processed');
        break;
    }
  };

  const sendMessage = async (message: string) => {
    if (!isConnectedRef.current) {
      addSystemMessage('Not connected. Please wait...');
      connectSSE();
      return;
    }

    // Create a new conversation message
    const convId = uuidv4();
    setActiveConversationId(convId);
    const newConversation: Message = {
      id: convId,
      type: 'conversation',
      content: '',
      timestamp: new Date().toISOString(),
      agentType: selectedAgent,
      userMessage: message,
      assistantMessage: '',
      timeline: [],
      isStreaming: true
    };
    setMessages(prev => [...prev, newConversation]);
    setIsProcessing(true);

    try {
      const response = await apiService.sendMessage({
        clientId,
        agentType: selectedAgent,
        message,
        threadId: currentThreadId || undefined,
      });

      setCurrentJobId(response.jobId);
    } catch (error) {
      setIsProcessing(false);
      updateConversation({
        assistantMessage: 'Failed to send message',
        isStreaming: false
      }, convId);
      setActiveConversationId(null);
      console.error('Send message error:', error);
    }
  };

  const handleNewThread = (agentType?: string) => {
    const targetAgent = agentType || selectedAgent;
    if (targetAgent !== selectedAgent) {
      setSelectedAgent(targetAgent);
    }
    setCurrentThreadId(null);
    setActiveConversationId(null);
    setMessages([]);
    addSystemMessage(`Started new thread (${targetAgent})`);
  };

  const handleStopJob = async () => {
    if (currentJobId) {
      try {
        await apiService.stopJob(currentJobId);
        setIsProcessing(false);
        setCurrentJobId(null);
        addSystemMessage('Job stopped');
      } catch (error) {
        console.error('Failed to stop job:', error);
      }
    }
  };

  const handleThreadFilterChange = (agentType: string) => {
    setThreadFilterAgent(agentType);
  };

  const refreshPersistedThreads = useCallback(() => {
    const filterValue = threadFilterRef.current === 'all' ? undefined : threadFilterRef.current;
    loadPersistedThreads(filterValue);
  }, [loadPersistedThreads]);

  const handleThreadSelect = async (thread: PersistedThread) => {
    if (isProcessing) {
      addSystemMessage('Finish or stop the current job before switching threads.', 'error');
      return;
    }

    setIsHistoryLoading(true);
    try {
      await apiService.resumeThread(thread.agentType, thread.threadId);
      if (selectedAgent !== thread.agentType) {
        setSelectedAgent(thread.agentType);
      }

      setCurrentThreadId(thread.threadId);
      setActiveConversationId(null);
      currentConversationRef.current = null;
      setMessages([]);

      const history = await apiService.getThreadHistory(thread.threadId);
      for (const event of history.events) {
        handleSSEMessage(event);
      }

      setActiveConversationId(null);
      addSystemMessage(`Loaded thread ${thread.threadId}`);
    } catch (error) {
      console.error('Failed to load thread history:', error);
      addSystemMessage('Failed to load thread history.', 'error');
    } finally {
      setIsHistoryLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <ThreadSidebar
        threads={persistedThreads}
        agents={agents}
        filterAgent={threadFilterAgent}
        onFilterChange={handleThreadFilterChange}
        selectedThreadId={currentThreadId}
        onSelectThread={handleThreadSelect}
        onNewThread={() => handleNewThread(newThreadAgent)}
        onRefresh={refreshPersistedThreads}
        isLoading={isHistoryLoading}
        newThreadAgent={newThreadAgent}
        onNewThreadAgentChange={setNewThreadAgent}
        disableNewThread={isProcessing || isHistoryLoading}
      />
      <div className="flex flex-col flex-1">
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs uppercase text-gray-500">Thread</div>
              <div className="text-sm font-mono text-gray-800">
                {currentThreadId || 'New thread'}
              </div>
            </div>
            <div className="text-sm text-gray-600">
              Agent: <span className="font-semibold text-gray-900">{selectedAgent}</span>
            </div>
            {isProcessing && (
              <button
                onClick={handleStopJob}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600"
              >
                Stop Job
              </button>
            )}
          </div>
        </div>

        <MessageList messages={messages} isLoadingHistory={isHistoryLoading} />

        <MessageInput
          onSendMessage={sendMessage}
          isProcessing={isProcessing}
          disabled={isHistoryLoading}
        />
      </div>
    </div>
  );
};
