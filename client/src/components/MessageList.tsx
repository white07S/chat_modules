import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as echarts from 'echarts';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message, DbToolCall, ChartSpecData } from '../types/messages';
import { apiService, SaveKnowledgeResponse } from '../api';

interface MessageListProps {
  messages: Message[];
  isLoadingHistory?: boolean;
  onPinChart?: (message: Message) => void;
  threadId?: string | null;
  defaultAgentType?: string;
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

const formatCsvValue = (value: unknown): string => {
  const normalized = formatCellValue(value);
  const escaped = normalized.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
};

const buildCsvFromRows = (
  rows: Record<string, unknown>[],
  columns: string[]
): string => {
  if (rows.length === 0) return '';
  const headers = columns.length > 0 ? columns : Object.keys(rows[0] ?? {});
  if (headers.length === 0) return '';

  const headerLine = headers.join(',');
  const dataLines = rows.map(row =>
    headers
      .map(column => formatCsvValue(row ? row[column] : undefined))
      .join(',')
  );

  return [headerLine, ...dataLines].join('\n');
};

const copyTextToClipboard = async (text: string): Promise<void> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard API is unavailable.');
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  const successful = document.execCommand('copy');
  document.body.removeChild(textArea);

  if (!successful) {
    throw new Error('Unable to copy text to clipboard.');
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

interface KnowledgeActionResult {
  saved: number;
  duplicates?: number;
}

interface DbResultsTabProps {
  calls: DbToolCall[];
  onSaveKnowledge?: () => Promise<KnowledgeActionResult>;
}

const DbResultsTab: React.FC<DbResultsTabProps> = ({ calls, onSaveKnowledge }) => {
  const [selectedCallId, setSelectedCallId] = useState<string>(calls[0]?.id ?? '');
  const [page, setPage] = useState(1);
  const [actionFeedback, setActionFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const actionFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSavingKnowledge, setIsSavingKnowledge] = useState(false);

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

  useEffect(() => {
    return () => {
      if (actionFeedbackTimeoutRef.current) {
        clearTimeout(actionFeedbackTimeoutRef.current);
        actionFeedbackTimeoutRef.current = null;
      }
    };
  }, []);

  const showActionFeedback = (message: string, tone: 'success' | 'error' = 'success') => {
    setActionFeedback({ message, tone });
    if (actionFeedbackTimeoutRef.current) {
      clearTimeout(actionFeedbackTimeoutRef.current);
      actionFeedbackTimeoutRef.current = null;
    }
    actionFeedbackTimeoutRef.current = setTimeout(() => {
      setActionFeedback(null);
      actionFeedbackTimeoutRef.current = null;
    }, 3000);
  };

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
  const hasSqlStatements = useMemo(
    () => calls.some(call => typeof call.sql === 'string' && call.sql.trim().length > 0),
    [calls]
  );

  const handleCopyCurrentPage = async () => {
    if (pageRows.length === 0) {
      showActionFeedback('No rows to copy on this page.', 'error');
      return;
    }

    const csvContent = buildCsvFromRows(pageRows, columns);
    if (!csvContent) {
      showActionFeedback('Unable to build CSV for this page.', 'error');
      return;
    }

    try {
      await copyTextToClipboard(csvContent);
      showActionFeedback(`Copied ${pageRows.length} row${pageRows.length === 1 ? '' : 's'} from page ${page}.`);
    } catch (error) {
      console.error('Failed to copy page rows', error);
      showActionFeedback('Copy failed. Please try again.', 'error');
    }
  };

  const handleDownloadAllCsv = () => {
    if (rows.length === 0) {
      showActionFeedback('No rows available to download.', 'error');
      return;
    }

    const csvContent = buildCsvFromRows(rows, columns);
    if (!csvContent) {
      showActionFeedback('Unable to build CSV for download.', 'error');
      return;
    }

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      showActionFeedback('CSV download is only available in the browser.', 'error');
      return;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `db-results-${selectedCall?.id || 'results'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    showActionFeedback(`Downloading ${rows.length} row${rows.length === 1 ? '' : 's'} as CSV.`);
  };

  const handleSaveKnowledge = async () => {
    if (!onSaveKnowledge) {
      return;
    }

    if (!hasSqlStatements) {
      showActionFeedback('No SQL statements available to save.', 'error');
      return;
    }

    setIsSavingKnowledge(true);
    try {
      const result = await onSaveKnowledge();
      const savedCount = result?.saved ?? 0;
      const duplicateCount = result?.duplicates ?? 0;

      if (savedCount > 0) {
        const duplicateNote = duplicateCount > 0
          ? ` (${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped)`
          : '';
        showActionFeedback(`Saved ${savedCount} SQL quer${savedCount === 1 ? 'y' : 'ies'}${duplicateNote}.`);
      } else if (duplicateCount > 0) {
        showActionFeedback('All SQL queries were already saved.', 'error');
      } else {
        showActionFeedback('No SQL queries were saved.', 'error');
      }
    } catch (error) {
      console.error('Failed to save knowledge', error);
      showActionFeedback('Failed to save knowledge. Please try again.', 'error');
    } finally {
      setIsSavingKnowledge(false);
    }
  };

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
        <div className="rounded-md border border-gray-200 overflow-hidden">
          <SyntaxHighlighter
            language="sql"
            style={oneLight}
            customStyle={{
              margin: 0,
              backgroundColor: '#fff',
              fontSize: '0.75rem',
              padding: '0.75rem',
              lineHeight: '1.25rem'
            }}
          >
            {selectedCall.sql || 'Query unavailable'}
          </SyntaxHighlighter>
        </div>
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

          <div className="space-y-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-gray-600">
              <div>
                Rows {rows.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + ROWS_PER_PAGE, rows.length)} of {rows.length}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                  onClick={handleCopyCurrentPage}
                  disabled={pageRows.length === 0}
                  title="Copy just the rows visible on this page"
                >
                  Copy Page
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 disabled:cursor-not-allowed"
                  onClick={handleDownloadAllCsv}
                  disabled={rows.length === 0}
                  title="Download every row as a CSV file"
                >
                  Download CSV
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded border border-green-500 text-green-600 hover:bg-green-50 disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                  onClick={handleSaveKnowledge}
                  disabled={!onSaveKnowledge || !hasSqlStatements || isSavingKnowledge}
                  title="Store these SQL statements for future retrieval"
                >
                  {isSavingKnowledge ? 'Saving...' : 'Save Knowledge'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  disabled={page === 1}
                >
                  Previous
                </button>
                <span>
                  Page {page} / {totalPages}
                </span>
                <button
                  className="px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                  onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </button>
              </div>
            </div>
            {actionFeedback && (
              <div
                className={`text-xs ${actionFeedback.tone === 'success' ? 'text-green-600' : 'text-red-600'}`}
              >
                {actionFeedback.message}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const ChartTab: React.FC<{ spec?: ChartSpecData | null; onPin?: () => void }> = ({ spec, onPin }) => {
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
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-600">Rendered chart</p>
        {onPin && spec?.option && (
          <button
            onClick={onPin}
            className="text-xs px-3 py-1 rounded-md border border-blue-500 text-blue-600 hover:bg-blue-50"
          >
            Pin to dashboard
          </button>
        )}
      </div>
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

interface AgentResponseTabsProps {
  message: Message;
  onPinChart?: (message: Message) => void;
  onSaveKnowledge?: (message: Message) => Promise<KnowledgeActionResult>;
}

const AgentResponseTabs: React.FC<AgentResponseTabsProps> = ({ message, onPinChart, onSaveKnowledge }) => {
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

  const knowledgeHandler = !message.isStreaming && onSaveKnowledge
    ? () => onSaveKnowledge(message)
    : undefined;

  const renderContent = () => {
    switch (activeTab) {
      case 'db':
        return dbCalls.length > 0 ? (
          <DbResultsTab calls={dbCalls} onSaveKnowledge={knowledgeHandler} />
        ) : (
          <div className="text-sm text-gray-600">No SQL calls captured.</div>
        );
      case 'chart':
        return <ChartTab spec={chartSpec} onPin={() => onPinChart?.(message)} />;
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
  onPinChart?: (message: Message) => void;
  onSaveKnowledge?: (message: Message) => Promise<KnowledgeActionResult>;
}

const ConversationMessage: React.FC<ConversationMessageProps> = ({
  message,
  isTimelineExpanded,
  onToggleTimeline,
  onPinChart,
  onSaveKnowledge
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
            <AgentResponseTabs
              message={message}
              onPinChart={onPinChart}
              onSaveKnowledge={onSaveKnowledge}
            />
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

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isLoadingHistory = false,
  onPinChart,
  threadId,
  defaultAgentType
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [expandedTimelines, setExpandedTimelines] = useState<Set<string>>(new Set());

  const saveKnowledgeForMessage = useCallback(async (message: Message): Promise<KnowledgeActionResult> => {
    const queries = (message.agentResponse?.dbCalls || [])
      .map((call) => (typeof call.sql === 'string' ? call.sql.trim() : ''))
      .filter((sql): sql is string => sql.length > 0);

    if (queries.length === 0) {
      throw new Error('No SQL statements to save.');
    }

    const response: SaveKnowledgeResponse = await apiService.saveKnowledge({
      agentType: message.agentType || defaultAgentType || null,
      threadId: threadId || null,
      messageId: message.id,
      queries
    });

    return {
      saved: typeof response.saved === 'number' ? response.saved : queries.length,
      duplicates: response.duplicates ?? 0
    };
  }, [threadId, defaultAgentType]);

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
      {isLoadingHistory && (
        <div className="text-center text-sm text-gray-500">Loading thread history...</div>
      )}
      {messages.map((message) => {
        if (message.type === 'conversation') {
          const isExpanded = expandedTimelines.has(message.id);
          return (
            <ConversationMessage
              key={message.id}
              message={message}
              isTimelineExpanded={isExpanded}
              onToggleTimeline={() => toggleTimeline(message.id)}
              onPinChart={onPinChart}
              onSaveKnowledge={saveKnowledgeForMessage}
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
