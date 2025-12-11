import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, RefreshCw, Sunrise, Sun, Sunset, Moon, type LucideIcon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { apiService, Agent, SSEEvent, PersistedThread, DashboardSummary, DashboardDetailsResponse } from './api';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { Message, ChartSpecData } from './types/messages';
import { collectTextFromToolContent, parseChartSpec, parseSqlResult, safeJsonParse } from './utils/parsers';
import { ThreadSidebar } from './components/ThreadSidebar';
import { DashboardPinModal, DashboardPinResult } from './components/DashboardPinModal';
import { DashboardView } from './components/DashboardView';
import { branding } from './branding.config';
import { resolveBrandAsset } from './brandingAssets';

type GreetingPeriod = 'morning' | 'afternoon' | 'evening' | 'night';

type GreetingState = {
  message: string;
  subtext: string;
  icon: LucideIcon;
  period: GreetingPeriod;
};

const greetingMap: Record<GreetingPeriod, { label: string; subtext: string; icon: LucideIcon }> = {
  morning: {
    label: 'Good morning',
    subtext: 'Let’s turn your questions into insight.',
    icon: Sunrise
  },
  afternoon: {
    label: 'Good afternoon',
    subtext: 'I’m ready to help you move work forward.',
    icon: Sun
  },
  evening: {
    label: 'Good evening',
    subtext: 'A perfect time to review results and plan ahead.',
    icon: Sunset
  },
  night: {
    label: 'Good night',
    subtext: 'I’ll stay sharp so you can wrap up confidently.',
    icon: Moon
  }
};

const resolveGreeting = (): GreetingState => {
  const hour = new Date().getHours();
  let period: GreetingPeriod = 'afternoon';
  if (hour < 12) {
    period = 'morning';
  } else if (hour < 17) {
    period = 'afternoon';
  } else if (hour < 21) {
    period = 'evening';
  } else {
    period = 'night';
  }
  const meta = greetingMap[period];
  const name = branding.defaultUser || 'there';
  return {
    message: `${meta.label}, ${name}`,
    subtext: meta.subtext,
    icon: meta.icon,
    period
  };
};

const headerLogo = resolveBrandAsset(branding.logoHeader);

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
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([]);
  const [maxDashboardPlots, setMaxDashboardPlots] = useState<number>(6);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string | null>(null);
  const [activeDashboard, setActiveDashboard] = useState<DashboardDetailsResponse | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'chat' | 'dashboard'>('chat');
  const [pinModalData, setPinModalData] = useState<{
    chartSpec: ChartSpecData | null | undefined;
    agentType?: string;
    sourceThreadId?: string | null;
    title: string;
  } | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const isDashboardView = viewMode === 'dashboard' && !!selectedDashboardId;
  const [greeting, setGreeting] = useState<GreetingState>(() => resolveGreeting());

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

  useEffect(() => {
    const interval = window.setInterval(() => setGreeting(resolveGreeting()), 60000);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

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

  const loadDashboards = useCallback(async () => {
    try {
      const response = await apiService.getDashboards();
      setDashboards(response.dashboards);
      setMaxDashboardPlots(response.maxPlots ?? 6);
      setDashboardError(null);
    } catch (error) {
      console.error('Failed to load dashboards:', error);
      setDashboardError('Failed to load dashboards.');
      addSystemMessage('Failed to load dashboards.', 'error');
    }
  }, [addSystemMessage]);

  const loadDashboardDetails = useCallback(async (dashboardId: string) => {
    setIsDashboardLoading(true);
    setDashboardError(null);
    try {
      const details = await apiService.getDashboard(dashboardId);
      setActiveDashboard(details);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      setDashboardError('Failed to load dashboard.');
      addSystemMessage('Failed to load dashboard.', 'error');
    } finally {
      setIsDashboardLoading(false);
    }
  }, [addSystemMessage]);

  const handleDashboardSelect = useCallback((dashboard: DashboardSummary) => {
    setSelectedDashboardId(dashboard.id);
    setViewMode('dashboard');
    setActiveDashboard(null);
    loadDashboardDetails(dashboard.id);
  }, [loadDashboardDetails]);

  const handleDashboardRefresh = useCallback(() => {
    loadDashboards();
    if (selectedDashboardId) {
      loadDashboardDetails(selectedDashboardId);
    }
  }, [loadDashboards, loadDashboardDetails, selectedDashboardId]);

  const handleNewDashboard = useCallback(async () => {
    const name = window.prompt('Name your new dashboard');
    if (!name) {
      return;
    }
    try {
      await apiService.createDashboard(name.trim());
      await loadDashboards();
      addSystemMessage(`Dashboard "${name.trim()}" created.`);
    } catch (error) {
      console.error('Failed to create dashboard:', error);
      addSystemMessage('Failed to create dashboard.', 'error');
    }
  }, [loadDashboards, addSystemMessage]);

  const exitDashboardView = useCallback(() => {
    setSelectedDashboardId(null);
    setViewMode('chat');
    setActiveDashboard(null);
  }, []);

  const handleRemovePlot = useCallback(async (plotId: string) => {
    if (!selectedDashboardId) return;
    try {
      await apiService.deleteDashboardPlot(selectedDashboardId, plotId);
      await Promise.all([
        loadDashboardDetails(selectedDashboardId),
        loadDashboards()
      ]);
      addSystemMessage('Plot removed from dashboard.');
    } catch (error) {
      console.error('Failed to remove plot:', error);
      addSystemMessage('Failed to remove plot.', 'error');
    }
  }, [selectedDashboardId, loadDashboardDetails, loadDashboards, addSystemMessage]);

  const handleMovePlot = useCallback(async (plotId: string, destinationDashboardId: string) => {
    if (!selectedDashboardId) return;
    try {
      await apiService.updateDashboardPlot(destinationDashboardId, plotId, {
        dashboardId: destinationDashboardId
      });
      if (destinationDashboardId === selectedDashboardId) {
        await loadDashboardDetails(destinationDashboardId);
      } else {
        await Promise.all([
          loadDashboardDetails(selectedDashboardId),
          loadDashboards()
        ]);
      }
      addSystemMessage('Plot moved successfully.');
    } catch (error) {
      console.error('Failed to move plot:', error);
      addSystemMessage('Failed to move plot.', 'error');
    }
  }, [selectedDashboardId, loadDashboardDetails, loadDashboards, addSystemMessage]);

  const handlePlotLayoutChange = useCallback(async (plotId: string, layout: { x: number; y: number; w: number; h: number }) => {
    if (!selectedDashboardId) return;
    try {
      await apiService.updateDashboardPlot(selectedDashboardId, plotId, { layout });
    } catch (error) {
      console.error('Failed to update layout:', error);
    }
  }, [selectedDashboardId]);

  const handlePinChartRequest = useCallback((message: Message) => {
    const chartSpec = message.agentResponse?.chartSpec;
    if (!chartSpec || !chartSpec.option) {
      addSystemMessage('No chart data available to pin.', 'error');
      return;
    }
    const resolvedTitle = (() => {
      const optionTitle = (chartSpec.option as any)?.title;
      if (typeof optionTitle === 'object' && optionTitle?.text) {
        return optionTitle.text as string;
      }
      return `Viz Chart - ${new Date().toLocaleString()}`;
    })();
    setPinModalData({
      chartSpec,
      agentType: message.agentType,
      sourceThreadId: currentThreadId,
      title: resolvedTitle
    });
  }, [addSystemMessage, currentThreadId]);

  const handlePinModalClose = useCallback(() => {
    setPinModalData(null);
  }, []);

  const handlePinModalSubmit = useCallback(async (result: DashboardPinResult) => {
    if (!pinModalData?.chartSpec) {
      setPinModalData(null);
      return;
    }
    try {
      let dashboardId = result.dashboardId;
      if (result.mode === 'new') {
        if (!result.dashboardName) {
          throw new Error('Dashboard name required');
        }
        const newDashboard = await apiService.createDashboard(result.dashboardName);
        dashboardId = newDashboard.id;
        await loadDashboards();
      }
      if (!dashboardId) {
        throw new Error('Dashboard selection required');
      }
      await apiService.addPlotToDashboard(dashboardId, {
        title: result.title,
        chartSpec: pinModalData.chartSpec,
        chartOption: pinModalData.chartSpec?.option ?? null,
        agentType: pinModalData.agentType,
        sourceThreadId: pinModalData.sourceThreadId ?? currentThreadId ?? null
      });
      await loadDashboards();
      if (selectedDashboardId === dashboardId) {
        await loadDashboardDetails(dashboardId);
      }
      const target = dashboards.find(d => d.id === dashboardId);
      addSystemMessage(`Pinned chart to dashboard "${target?.name || result.dashboardName || 'Dashboard'}".`);
    } catch (error) {
      console.error('Failed to pin chart:', error);
      addSystemMessage('Failed to pin chart.', 'error');
    } finally {
      setPinModalData(null);
    }
  }, [pinModalData, currentThreadId, selectedDashboardId, loadDashboardDetails, loadDashboards, dashboards, addSystemMessage]);

  // Load agents on mount
  useEffect(() => {
    loadAgents();
    loadDashboards();
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
    const ensureConversationActive = () => {
      if (currentConversationRef.current) {
        return currentConversationRef.current;
      }

      const convId = uuidv4();
      setActiveConversationId(convId);
      const newConversation: Message = {
        id: convId,
        type: 'conversation',
        content: '',
        timestamp: new Date().toISOString(),
        agentType: event.agentType || selectedAgent,
        userMessage: '',
        assistantMessage: '',
        timeline: [],
        isStreaming: true
      };
      setMessages(prev => [...prev, newConversation]);
      return convId;
    };

    switch (agentEvent.type) {
      // Session and thread events
      case 'session_meta':
        addTimelineEvent(getEventLabel('session_meta'), `Session: ${agentEvent.payload?.id?.slice(-8) || 'started'}`);
        break;

      case 'thread.started':
        addTimelineEvent(getEventLabel('thread.started'), `Thread: ${agentEvent.thread_id?.slice(-8) || 'new'}`);
        break;

      case 'turn.started':
        ensureConversationActive();
        addTimelineEvent(getEventLabel('turn.started'), 'Processing...');
        break;

      // Response streaming events - these come as content is generated
      case 'response_item':
        if (agentEvent.payload?.type === 'message') {
          if (agentEvent.payload.role === 'user') {
            ensureConversationActive();
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
          ensureConversationActive();
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
        const activeConversationId = currentConversationRef.current || ensureConversationActive();
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
          ensureConversationActive();
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
    exitDashboardView();
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

    exitDashboardView();
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

  const GreetingIcon = greeting.icon;

  return (
    <>
      <div className="h-screen flex flex-col brand-shell">
        <header className="bg-white border-b border-brand shadow-sm">
          {isDashboardView ? (
            <div className="px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase text-brand-muted">Dashboard</p>
                <p className="text-sm font-semibold text-brand-text">
                  {activeDashboard?.dashboard.name || 'Loading...'}
                </p>
                <p className="text-xs text-brand-muted">
                  {selectedDashboardId}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDashboardRefresh}
                  className="btn btn-outline btn-sm"
                >
                  <RefreshCw size={14} />
                  Refresh
                </button>
                <button
                  onClick={exitDashboardView}
                  className="btn btn-secondary btn-sm"
                >
                  Back to Threads
                </button>
              </div>
            </div>
          ) : (
            <div className="px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                {headerLogo && (
                  <img src={headerLogo} alt={`${branding.appShortName} logo`} className="h-8 w-auto" />
                )}
                <div>
                  <p className="text-xs uppercase text-brand-muted">Active Thread</p>
                  <p className="text-sm font-mono text-brand-text">
                    {currentThreadId || 'New thread'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-brand-muted">
                <span className="flex items-center gap-2">
                  <MessageCircle size={16} className="text-brand-muted" />
                  Agent: <span className="font-semibold text-brand-text">{selectedAgent}</span>
                </span>
                {isProcessing && (
                  <button
                    onClick={handleStopJob}
                    className="btn btn-outline btn-sm text-red-600 border border-red-200"
                  >
                    Stop Job
                  </button>
                )}
              </div>
            </div>
          )}
        </header>
        <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
          <ThreadSidebar
            className="w-full md:w-auto md:flex-[0.25] lg:flex-[0.18] min-w-[220px] max-w-sm"
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
            dashboards={dashboards}
            selectedDashboardId={selectedDashboardId}
            onSelectDashboard={handleDashboardSelect}
            onNewDashboard={handleNewDashboard}
            onDashboardRefresh={handleDashboardRefresh}
            isDashboardLoading={isDashboardLoading}
            maxDashboardPlots={maxDashboardPlots}
          />
          <div className="flex flex-1 flex-col overflow-hidden border-t md:border-t-0 md:border-l border-brand/40">
            {isDashboardView ? (
              <DashboardView
                details={activeDashboard}
                dashboards={dashboards}
                isLoading={isDashboardLoading}
                onMovePlot={handleMovePlot}
                onRemovePlot={handleRemovePlot}
                onLayoutChange={handlePlotLayoutChange}
                error={dashboardError}
              />
            ) : (
              <>
                <div className="px-4 sm:px-6 pt-4 sm:pt-6">
                  <div className="panel p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                      {GreetingIcon && (
                        <div className="h-10 w-10 rounded-full surface-muted flex items-center justify-center text-brand-muted">
                          <GreetingIcon size={20} />
                        </div>
                      )}
                      <div>
                        <p className="text-xs uppercase text-brand-muted">Welcome back</p>
                        <p className="text-xl font-semibold text-brand-text">{greeting.message}</p>
                      </div>
                    </div>
                    <p className="text-sm text-brand-muted">{greeting.subtext}</p>
                  </div>
                </div>
                <MessageList
                  messages={messages}
                  isLoadingHistory={isHistoryLoading}
                  onPinChart={handlePinChartRequest}
                  threadId={currentThreadId}
                  defaultAgentType={selectedAgent}
                />

                <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                  <MessageInput
                    onSendMessage={sendMessage}
                    isProcessing={isProcessing}
                    disabled={isHistoryLoading}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <DashboardPinModal
        isOpen={Boolean(pinModalData)}
        dashboards={dashboards}
        defaultTitle={pinModalData?.title || 'Pinned chart'}
        maxPlots={maxDashboardPlots}
        onSubmit={handlePinModalSubmit}
        onClose={handlePinModalClose}
      />
    </>
  );
};
