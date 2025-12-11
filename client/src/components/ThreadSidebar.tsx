import React from 'react';
import { LayoutDashboard, MessagesSquare, Plus, RefreshCw } from 'lucide-react';
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
  className?: string;
}

const formatTimestamp = (value: string): string => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
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
  className,
}) => {
  const isNewThreadDisabled = disableNewThread || agents.length === 0;
  const containerClasses = ['border-brand surface-muted flex flex-col h-auto md:h-full border-b md:border-b-0 md:border-r'];
  if (className) {
    containerClasses.push(className);
  }
  return (
    <div className={containerClasses.join(' ')}>
      <div className="p-4 space-y-4 flex-1 overflow-hidden">
        <section className="panel p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-text">
              <LayoutDashboard size={16} />
              <span>Dashboards</span>
            </div>
            <button
              onClick={onDashboardRefresh}
              className="btn btn-sm btn-ghost"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
          <p className="text-xs text-brand-muted">Pin insights from viz_agent outputs.</p>
          <button
            onClick={onNewDashboard}
            className="btn btn-secondary w-full"
          >
            <Plus size={16} />
            New Dashboard
          </button>
          {isDashboardLoading && (
            <div className="text-xs text-brand-muted">Loading dashboards...</div>
          )}
          {dashboards.length === 0 && !isDashboardLoading && (
            <div className="text-xs text-brand-muted">No dashboards yet.</div>
          )}
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {dashboards.map((dashboard) => {
              const isSelected = selectedDashboardId === dashboard.id;
              return (
                <button
                  key={dashboard.id}
                  onClick={() => onSelectDashboard(dashboard)}
                  className="w-full text-left p-3 border rounded-[var(--brand-radius)] text-sm transition-all shadow-sm"
                  style={{
                    backgroundColor: isSelected ? 'var(--brand-primary-soft)' : 'var(--brand-surface)',
                    borderColor: isSelected ? 'var(--brand-primary)' : 'var(--brand-border)'
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-brand-text truncate">{dashboard.name}</span>
                    <span className="text-[11px] text-brand-muted whitespace-nowrap">
                      {dashboard.plotCount}/{maxDashboardPlots} plots
                    </span>
                  </div>
                  <div className="text-[11px] text-brand-muted mt-1">
                    Updated {formatTimestamp(dashboard.updatedAt)}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-text">
              <MessagesSquare size={16} />
              <span>Threads</span>
            </div>
            <button
              onClick={onRefresh}
              className="btn btn-sm btn-ghost"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-brand-muted uppercase">Agent</label>
            <select
              value={filterAgent}
              onChange={(event) => onFilterChange(event.target.value)}
              className="brand-input text-sm"
            >
              <option value="all">All agents</option>
              {agents.map(agent => (
                <option key={agent.type} value={agent.type}>{agent.type}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-brand-muted uppercase">New Thread Agent</label>
            <select
              value={newThreadAgent}
              onChange={(event) => onNewThreadAgentChange(event.target.value)}
              className="brand-input text-sm"
            >
              {agents.map(agent => (
                <option key={agent.type} value={agent.type}>{agent.type}</option>
              ))}
            </select>
          </div>
        <button
          onClick={onNewThread}
          disabled={isNewThreadDisabled}
          className="btn btn-secondary w-full disabled:cursor-not-allowed"
        >
          <Plus size={16} />
          New Thread
        </button>
      </section>

      <section className="panel p-0 flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-brand flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-text">
            <MessagesSquare size={16} />
            <span>Saved Threads</span>
          </div>
          <span className="text-xs text-brand-muted">{threads.length} total</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading && (
            <div className="text-xs text-brand-muted">Loading...</div>
          )}
          {threads.length === 0 && !isLoading && (
            <div className="text-xs text-brand-muted">No threads yet.</div>
          )}
          {threads.map(thread => {
            const isActive = selectedThreadId === thread.threadId;
            const threadName = thread.title || thread.threadId;
            const stateClasses = isActive
              ? 'border-brand bg-[var(--brand-surface)] text-brand-text shadow-sm'
              : 'border-transparent text-brand-muted hover:border-brand hover:bg-[var(--brand-surface-alt)]';
            return (
              <button
                key={thread.threadId}
                onClick={() => onSelectThread(thread)}
                disabled={isLoading}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors border focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--brand-primary)] truncate ${stateClasses}`}
                title={threadName}
              >
                {threadName}
              </button>
            );
          })}
        </div>
      </section>
      </div>
    </div>
  );
};
