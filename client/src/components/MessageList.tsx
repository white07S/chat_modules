import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as echarts from 'echarts';
import { Message, DbToolCall, ChartSpecData } from '../types/messages';

interface MessageListProps {
  messages: Message[];
}

type TabKey = 'response' | 'db' | 'chart';
type EChartsInstance = echarts.ECharts;
type EChartsOption = echarts.EChartsCoreOption;

const ROWS_PER_PAGE = 10;

const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const buildChartOptionWithDownload = (option: Record<string, unknown>): EChartsOption => {
  const normalized: Record<string, unknown> = { ...option };
  const toolbox = { ...((option as any).toolbox || {}) };
  const feature = { ...(toolbox.feature || {}) };

  toolbox.show = true;

  feature.saveAsImage = {
    show: true,
    type: 'png',
    ...(feature.saveAsImage || {})
  };

  normalized.toolbox = {
    ...toolbox,
    feature
  };

  return normalized as EChartsOption;
};

const MarkdownBlock: React.FC<{ content: string }> = ({ content }) => (
  <div className="markdown-body text-sm leading-relaxed text-gray-900 space-y-2">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>
      {content || ''}
    </ReactMarkdown>
  </div>
);

const StreamingResponse: React.FC<{ message: Message }> = ({ message }) => (
  <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-900 text-sm">
    <div className="whitespace-pre-wrap break-words">
      {message.assistantMessage || 'Waiting for assistant response...'}
      {message.isStreaming && <span className="animate-pulse ml-1">▊</span>}
    </div>
  </div>
);

const DbResultsTab: React.FC<{ calls: DbToolCall[] }> = ({ calls }) => {
  const [selectedCallId, setSelectedCallId] = useState<string>(calls[0]?.id ?? '');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (calls.length === 0) {
      setSelectedCallId('');
      setPage(1);
      return;
    }

    const exists = calls.find(call => call.id === selectedCallId);
    if (!exists) {
      setSelectedCallId(calls[0].id);
      setPage(1);
    }
  }, [calls, selectedCallId]);

  const selectedCall = calls.find(call => call.id === selectedCallId) ?? calls[0];
  const rows = useMemo(() => selectedCall?.rows ?? [], [selectedCall]);
  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const columns = useMemo(() => {
    const colSet = new Set<string>();
    rows.forEach(row => {
      Object.keys(row || {}).forEach(key => colSet.add(key));
    });
    return Array.from(colSet);
  }, [rows]);

  const startIndex = (page - 1) * ROWS_PER_PAGE;
  const pageRows = rows.slice(startIndex, startIndex + ROWS_PER_PAGE);

  if (!selectedCall) {
    return <div className="text-sm text-gray-600">No SQL calls captured.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="text-xs font-semibold uppercase text-gray-600">
          SQL Tool Call
          <select
            value={selectedCallId}
            onChange={(event) => {
              setSelectedCallId(event.target.value);
              setPage(1);
            }}
            className="mt-1 block w-full sm:w-56 rounded-md border-gray-300 text-sm"
          >
            {calls.map((call, index) => (
              <option key={call.id} value={call.id}>
                {`Call ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
        <div className="text-xs text-gray-500">
          {rows.length} row{rows.length === 1 ? '' : 's'} captured
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-600 mb-1">SQL Query</p>
        <pre className="rounded-md bg-gray-900 text-green-200 text-xs p-3 overflow-auto">
          {selectedCall.sql || 'Query unavailable'}
        </pre>
      </div>

      {selectedCall.parseError && (
        <div className="text-xs text-red-600">
          Unable to parse SQL result: {selectedCall.parseError}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-sm text-gray-600">
          {selectedCall.parseError ? 'Showing raw output instead.' : 'Query returned no rows.'}
          {selectedCall.rawResult && (
            <pre className="mt-2 rounded-md bg-gray-100 text-xs p-3 overflow-auto max-h-48">
              {selectedCall.rawResult}
            </pre>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {columns.map(column => (
                    <th
                      key={column}
                      className="px-3 py-2 text-left text-xs font-semibold text-gray-600"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {pageRows.map((row, rowIndex) => (
                  <tr key={`${selectedCall.id}-${rowIndex}`}>
                    {columns.map(column => (
                      <td
                        key={column}
                        className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap"
                      >
                        {formatCellValue(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-gray-600">
            <div>
              Rows {rows.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + ROWS_PER_PAGE, rows.length)} of {rows.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-2 py-1 rounded border border-gray-300 disabled:opacity-50"
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page === 1}
              >
                Previous
              </button>
              <span>
                Page {page} / {totalPages}
              </span>
              <button
                className="px-2 py-1 rounded border border-gray-300 disabled:opacity-50"
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page === totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ChartTab: React.FC<{ spec?: ChartSpecData | null }> = ({ spec }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<EChartsInstance | null>(null);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }

    if (!spec?.option) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
      return;
    }

    const chart = echarts.init(chartRef.current);
    chartInstanceRef.current = chart;

    chart.setOption(buildChartOptionWithDownload(spec.option));

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, [spec?.option]);

  if (!spec) {
    return <div className="text-sm text-gray-600">Chart specification not available.</div>;
  }

  return (
    <div className="space-y-3">
      {spec.parseError && (
        <div className="text-xs text-red-600">
          Unable to parse chart specification: {spec.parseError}
        </div>
      )}
      {spec.option ? (
        <div ref={chartRef} className="w-full h-80 rounded-md bg-white" />
      ) : (
        <div className="text-sm text-gray-600">Chart option not available.</div>
      )}
      {!spec.option && spec.rawSpec && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1">Raw Spec</p>
          <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-md overflow-auto max-h-48">
            {spec.rawSpec}
          </pre>
        </div>
      )}
    </div>
  );
};

const AgentResponseTabs: React.FC<{ message: Message }> = ({ message }) => {
  const dbCalls = message.agentResponse?.dbCalls || [];
  const chartSpec = message.agentResponse?.chartSpec;
  const hasChartData = Boolean(chartSpec);

  const tabs = useMemo<Array<{ key: TabKey; label: string }>>(() => {
    const items: Array<{ key: TabKey; label: string }> = [
      { key: 'response', label: 'Response' }
    ];

    if (dbCalls.length > 0) {
      items.push({ key: 'db', label: 'SQL Results' });
    }

    if (hasChartData) {
      items.push({ key: 'chart', label: 'Chart' });
    }

    return items;
  }, [dbCalls.length, hasChartData]);

  const [activeTab, setActiveTab] = useState<TabKey>(tabs[0]?.key ?? 'response');

  useEffect(() => {
    if (!tabs.find(tab => tab.key === activeTab)) {
      setActiveTab(tabs[0].key);
    }
  }, [tabs, activeTab]);

  const renderContent = () => {
    switch (activeTab) {
      case 'db':
        return dbCalls.length > 0 ? (
          <DbResultsTab calls={dbCalls} />
        ) : (
          <div className="text-sm text-gray-600">No SQL calls captured.</div>
        );
      case 'chart':
        return <ChartTab spec={chartSpec} />;
      case 'response':
      default:
        if (message.agentResponse?.finalMessage || message.assistantMessage) {
          return <MarkdownBlock content={message.agentResponse?.finalMessage || message.assistantMessage || ''} />;
        }
        return (
          <div className="text-sm text-gray-600">
            {message.isStreaming ? 'Streaming response...' : 'No response available yet.'}
            {message.isStreaming && <span className="animate-pulse ml-1">▊</span>}
          </div>
        );
    }
  };

  return (
    <div className="border border-green-200 rounded-lg shadow-sm bg-white">
      <div className="flex border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
              activeTab === tab.key
                ? 'text-green-700 border-b-2 border-green-600 bg-green-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="p-4 text-gray-900 text-sm bg-white">
        {renderContent()}
      </div>
    </div>
  );
};

interface ConversationMessageProps {
  message: Message;
  isTimelineExpanded: boolean;
  onToggleTimeline: () => void;
}

const ConversationMessage: React.FC<ConversationMessageProps> = ({
  message,
  isTimelineExpanded,
  onToggleTimeline
}) => {
  const timestamp = new Date(message.timestamp).toLocaleTimeString();
  const hasAgentData = Boolean(
    message.agentResponse?.finalMessage ||
    (message.agentResponse?.dbCalls && message.agentResponse.dbCalls.length > 0) ||
    message.agentResponse?.chartSpec
  );

  return (
    <div className="space-y-2">
      {message.userMessage && (
        <div className="flex justify-end">
          <div className="max-w-3xl px-4 py-2 rounded-lg bg-blue-100 text-blue-900">
            <div className="flex items-center space-x-2 mb-1">
              <span className="font-semibold text-xs uppercase">USER</span>
              {message.agentType && <span className="text-xs opacity-75">({message.agentType})</span>}
              <span className="text-xs opacity-50">{timestamp}</span>
            </div>
            <div className="whitespace-pre-wrap break-words">{message.userMessage}</div>
          </div>
        </div>
      )}

      <div className="flex justify-start">
        <div className="max-w-3xl w-full">
          <div className="flex items-center space-x-2 text-xs text-gray-500 mb-1">
            <span className="font-semibold text-gray-700 uppercase">ASSISTANT</span>
            {message.agentType && <span>({message.agentType})</span>}
            <span>{timestamp}</span>
          </div>
          {hasAgentData ? (
            <AgentResponseTabs message={message} />
          ) : (
            <StreamingResponse message={message} />
          )}

          {message.timeline && message.timeline.length > 0 && (
            <div className="mt-2 ml-2">
              <button
                onClick={onToggleTimeline}
                className="flex items-center space-x-1 text-xs text-gray-600 hover:text-gray-800 transition-colors"
              >
                <span>{isTimelineExpanded ? '▼' : '▶'}</span>
                <span>Timeline ({message.timeline.length} steps)</span>
              </button>
              {isTimelineExpanded && (
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
};

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [expandedTimelines, setExpandedTimelines] = useState<Set<string>>(new Set());

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
      default:
        return 'bg-gray-100 text-gray-900';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => {
        if (message.type === 'conversation') {
          const isExpanded = expandedTimelines.has(message.id);
          return (
            <ConversationMessage
              key={message.id}
              message={message}
              isTimelineExpanded={isExpanded}
              onToggleTimeline={() => toggleTimeline(message.id)}
            />
          );
        }

        if (message.type === 'system') {
          return (
            <div key={message.id} className="flex justify-center">
              <div className="max-w-3xl px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm">
                {message.content}
              </div>
            </div>
          );
        }

        if (message.type === 'event') {
          return null;
        }

        return (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-3xl px-4 py-2 rounded-lg ${getMessageStyles(message.type)}`}>
              <div className="flex items-center space-x-2 mb-1">
                <span className="font-semibold text-xs uppercase">{message.type}</span>
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
