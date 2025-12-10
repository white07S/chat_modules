import React, { useEffect, useRef } from 'react';

export interface Message {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'tool' | 'event' | 'conversation';
  content: string;
  timestamp: string;
  agentType?: string;
  metadata?: any;
  // For conversation type messages
  userMessage?: string;
  assistantMessage?: string;
  timeline?: Array<{
    label: string;
    content: string;
    timestamp: string;
  }>;
  isStreaming?: boolean;
}

interface MessageListProps {
  messages: Message[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [expandedTimelines, setExpandedTimelines] = React.useState<Set<string>>(new Set());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const toggleTimeline = (messageId: string) => {
    setExpandedTimelines(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const getMessageStyles = (type: string) => {
    switch (type) {
      case 'user':
        return 'bg-blue-100 text-blue-900 self-end';
      case 'assistant':
        return 'bg-green-100 text-green-900 self-start';
      case 'system':
        return 'bg-gray-100 text-gray-700 self-center text-sm';
      case 'tool':
        return 'bg-yellow-100 text-yellow-900 self-start text-sm';
      case 'event':
        return 'bg-purple-100 text-purple-900 self-start text-xs';
      case 'conversation':
        return '';
      default:
        return 'bg-gray-100 text-gray-900';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => {
        // Handle conversation messages with timeline
        if (message.type === 'conversation') {
          const isExpanded = expandedTimelines.has(message.id);
          return (
            <div key={message.id} className="space-y-2">
              {/* User Message */}
              {message.userMessage && (
                <div className="flex justify-end">
                  <div className="max-w-3xl px-4 py-2 rounded-lg bg-blue-100 text-blue-900">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-semibold text-xs uppercase">USER</span>
                      <span className="text-xs opacity-75">({message.agentType})</span>
                      <span className="text-xs opacity-50">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap break-words">{message.userMessage}</div>
                  </div>
                </div>
              )}

              {/* Assistant Response */}
              <div className="flex justify-start">
                <div className="max-w-3xl">
                  <div className="px-4 py-2 rounded-lg bg-green-100 text-green-900">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-semibold text-xs uppercase">ASSISTANT</span>
                      <span className="text-xs opacity-75">({message.agentType})</span>
                      <span className="text-xs opacity-50">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap break-words">
                      {message.assistantMessage || message.content}
                      {message.isStreaming && <span className="animate-pulse">▊</span>}
                    </div>
                  </div>

                  {/* Timeline - Collapsible */}
                  {message.timeline && message.timeline.length > 0 && (
                    <div className="mt-2 ml-4">
                      <button
                        onClick={() => toggleTimeline(message.id)}
                        className="flex items-center space-x-1 text-xs text-gray-600 hover:text-gray-800 transition-colors"
                      >
                        <span>{isExpanded ? '▼' : '▶'}</span>
                        <span>Timeline ({message.timeline.length} steps)</span>
                      </button>
                      {isExpanded && (
                        <div className="mt-2 pl-4 border-l-2 border-gray-300 space-y-1">
                          {message.timeline.map((step, idx) => (
                            <div key={idx} className="flex items-start space-x-2 text-xs text-gray-600">
                              <span className="font-medium whitespace-nowrap">{step.label}:</span>
                              <span className="flex-1">{step.content}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        }

        // Handle system messages
        if (message.type === 'system') {
          return (
            <div key={message.id} className="flex justify-center">
              <div className="max-w-3xl px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm">
                {message.content}
              </div>
            </div>
          );
        }

        // Skip individual event messages (they're in timeline now)
        if (message.type === 'event') {
          return null;
        }

        // Handle old-style messages (fallback for user, assistant, tool)
        return (
          <div
            key={message.id}
            className={`flex ${
              message.type === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-3xl px-4 py-2 rounded-lg ${getMessageStyles(message.type)}`}
            >
              <div className="flex items-center space-x-2 mb-1">
                <span className="font-semibold text-xs uppercase">
                  {message.type}
                </span>
                {message.agentType && (
                  <span className="text-xs opacity-75">({message.agentType})</span>
                )}
                <span className="text-xs opacity-50">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="whitespace-pre-wrap break-words">
                {message.content}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
};