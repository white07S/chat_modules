import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { apiService, Agent, SSEEvent } from './api';
import { AgentSelector } from './components/AgentSelector';
import { MessageList, Message } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { ThreadControls } from './components/ThreadControls';

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

  const eventSourceRef = useRef<EventSource | null>(null);
  const isConnectedRef = useRef(false);
  const currentConversationRef = useRef<string | null>(null);

  const setActiveConversationId = (conversationId: string | null) => {
    currentConversationRef.current = conversationId;
    setCurrentConversationIdState(conversationId);
  };

  useEffect(() => {
    currentConversationRef.current = currentConversationId;
  }, [currentConversationId]);

  // Load agents on mount
  useEffect(() => {
    loadAgents();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Connect SSE when agent changes
  useEffect(() => {
    connectSSE();
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

  const updateConversation = (updates: Partial<Message>, conversationId?: string | null) => {
    const targetConversationId = conversationId ?? currentConversationRef.current;
    if (!targetConversationId) return;

    setMessages(prev => {
      const lastIndex = prev.findIndex(msg => msg.id === targetConversationId);
      if (lastIndex === -1) return prev;

      const newMessages = [...prev];
      newMessages[lastIndex] = {
        ...newMessages[lastIndex],
        ...updates,
        timeline: updates.timeline ? [
          ...(newMessages[lastIndex].timeline || []),
          ...updates.timeline
        ] : newMessages[lastIndex].timeline
      };
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
            // User message echo - don't add to timeline
          } else if (agentEvent.payload.role === 'assistant') {
            // Assistant response - might be partial
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
            isStreaming: false
          }, currentConversationRef.current);
        } else if (agentEvent.item?.type === 'command_execution') {
          addTimelineEvent('Command Done', `✅ ${agentEvent.item.command}`);
        } else if (agentEvent.item?.type === 'function_call') {
          addTimelineEvent('Tool Done', `✅ ${agentEvent.item.name}`);
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

  const addMessage = (message: Message) => {
    setMessages(prev => [...prev, message]);
  };

  const addSystemMessage = (content: string, type: 'system' | 'error' = 'system') => {
    addMessage({
      id: uuidv4(),
      type: type === 'error' ? 'system' : 'system',
      content,
      timestamp: new Date().toISOString(),
    });
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

  const handleNewThread = () => {
    setCurrentThreadId(null);
    setActiveConversationId(null);
    setMessages([]);
    addSystemMessage('Started new thread');
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

  const handleResumeThread = async (threadId: string) => {
    try {
      await apiService.resumeThread(selectedAgent, threadId);
      setCurrentThreadId(threadId);
      setMessages([]);
      addSystemMessage(`Resumed thread: ${threadId}`);
    } catch (error) {
      addSystemMessage('Failed to resume thread', 'error');
      console.error('Resume thread error:', error);
    }
  };

  const handleAgentChange = (agentType: string) => {
    setSelectedAgent(agentType);
    setCurrentThreadId(null);
    setActiveConversationId(null);
    setMessages([]);
    addSystemMessage(`Switched to ${agentType} agent`);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="bg-white shadow-sm">
        <AgentSelector
          agents={agents}
          selectedAgent={selectedAgent}
          onAgentChange={handleAgentChange}
        />
        <ThreadControls
          currentThreadId={currentThreadId}
          currentJobId={currentJobId}
          isProcessing={isProcessing}
          onNewThread={handleNewThread}
          onStopJob={handleStopJob}
          onResumeThread={handleResumeThread}
        />
      </div>

      <MessageList messages={messages} />

      <MessageInput
        onSendMessage={sendMessage}
        isProcessing={isProcessing}
      />
    </div>
  );
};
