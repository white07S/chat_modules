import React from 'react';
import { Agent, PersistedThread, DashboardSummary } from '../api';

interface ThreadSidebarProps {
  threads: PersistedThread[];
  agents: Agent[];
  filterAgent: string;
  onFilterChange: (value: string) => void;
  selectedThreadId: string | null;
  onSelectThread: (thread: PersistedThread) => void;
  onNewThread: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  newThreadAgent: string;
  onNewThreadAgentChange: (value: string) => void;
  disableNewThread?: boolean;
  dashboards: DashboardSummary[];
  selectedDashboardId: string | null;
  onSelectDashboard: (dashboard: DashboardSummary) => void;
  onNewDashboard: () => void;
  onDashboardRefresh: () => void;
  isDashboardLoading?: boolean;
  maxDashboardPlots: number;
}

const formatTimestamp = (value: string): string => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const getPreviewText = (thread: PersistedThread): string => {
  return thread.lastAgentMessage || thread.lastUserMessage || 'No messages yet';
};

export const ThreadSidebar: React.FC<ThreadSidebarProps> = ({
  threads,
  agents,
  filterAgent,
  onFilterChange,
  selectedThreadId,
  onSelectThread,
  onNewThread,
  onRefresh,
  isLoading,
  newThreadAgent,
  onNewThreadAgentChange,
  disableNewThread = false,
  dashboards,
  selectedDashboardId,
  onSelectDashboard,
  onNewDashboard,
  onDashboardRefresh,
  isDashboardLoading = false,
  maxDashboardPlots,
}) => {
  const isNewThreadDisabled = disableNewThread || agents.length === 0;
  return (
    <div className="w-72 border-r border-gray-200 bg-white flex flex-col">
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Dashboards</h2>
          <button
            onClick={onDashboardRefresh}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Refresh
          </button>
        </div>
        <p className="text-xs text-gray-500">Pin visualizations for viz_agent</p>
        <button
          onClick={onNewDashboard}
          className="w-full text-sm rounded-md py-2 bg-blue-500 text-white hover:bg-blue-600"
        >
          + New Dashboard
        </button>
        {isDashboardLoading && (
          <div className="text-xs text-gray-500">Loading dashboards...</div>
        )}
        {dashboards.length === 0 && !isDashboardLoading && (
          <div className="text-xs text-gray-500">No dashboards yet.</div>
        )}
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {dashboards.map((dashboard) => {
            const isSelected = selectedDashboardId === dashboard.id;
            return (
              <button
                key={dashboard.id}
                onClick={() => onSelectDashboard(dashboard)}
                className={`w-full text-left p-3 rounded-md border text-sm ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800 truncate">{dashboard.name}</span>
                  <span className="text-[11px] text-gray-500">
                    {dashboard.plotCount}/{maxDashboardPlots} plots
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 mt-1">
                  Updated {formatTimestamp(dashboard.updatedAt)}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Threads</h2>
          <button
            onClick={onRefresh}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Refresh
          </button>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase">Agent</label>
          <select
            value={filterAgent}
            onChange={(event) => onFilterChange(event.target.value)}
            className="w-full border border-gray-300 rounded-md text-sm px-2 py-1"
          >
            <option value="all">All agents</option>
            {agents.map(agent => (
              <option key={agent.type} value={agent.type}>{agent.type}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-600 uppercase">New Thread Agent</label>
          <select
            value={newThreadAgent}
            onChange={(event) => onNewThreadAgentChange(event.target.value)}
            className="w-full border border-gray-300 rounded-md text-sm px-2 py-1"
          >
            {agents.map(agent => (
              <option key={agent.type} value={agent.type}>{agent.type}</option>
            ))}
          </select>
        </div>
        <button
          onClick={onNewThread}
          disabled={isNewThreadDisabled}
          className={`w-full text-sm rounded-md py-2 transition-colors ${
            isNewThreadDisabled
              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          + New Thread
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-4 text-xs text-gray-500">Loading...</div>
        )}
        {threads.length === 0 && !isLoading && (
          <div className="p-4 text-xs text-gray-500">No threads yet.</div>
        )}
        <div className="divide-y divide-gray-100">
          {threads.map(thread => {
            const isActive = selectedThreadId === thread.threadId;
            return (
              <button
                key={thread.threadId}
                onClick={() => onSelectThread(thread)}
                disabled={isLoading}
                className={`w-full text-left p-4 transition-colors ${
                  isActive ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50'
                } ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-800 truncate">{thread.title || thread.threadId}</span>
                  <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">{thread.agentType}</span>
                </div>
                <div className="text-[11px] text-gray-500 mt-1">Updated {formatTimestamp(thread.updatedAt)}</div>
                <div className="text-xs text-gray-600 mt-2 overflow-hidden text-ellipsis whitespace-nowrap">{getPreviewText(thread)}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
