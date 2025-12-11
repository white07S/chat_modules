import React, { useEffect, useState } from 'react';
import { X, Pin } from 'lucide-react';
import { DashboardSummary } from '../api';

export interface DashboardPinResult {
  mode: 'existing' | 'new';
  dashboardId?: string;
  dashboardName?: string;
  title: string;
}

interface DashboardPinModalProps {
  isOpen: boolean;
  dashboards: DashboardSummary[];
  defaultTitle: string;
  maxPlots: number;
  onSubmit: (result: DashboardPinResult) => void;
  onClose: () => void;
}

export const DashboardPinModal: React.FC<DashboardPinModalProps> = ({
  isOpen,
  dashboards,
  defaultTitle,
  maxPlots,
  onSubmit,
  onClose
}) => {
  const [title, setTitle] = useState(defaultTitle);
  const availableDashboards = dashboards.filter(d => d.plotCount < maxPlots);
  const [selection, setSelection] = useState<string>(() => (availableDashboards[0]?.id ?? 'new'));
  const [newDashboardName, setNewDashboardName] = useState('');

  useEffect(() => {
    setTitle(defaultTitle);
    const nextSelection = dashboards.find(d => d.plotCount < maxPlots)?.id ?? 'new';
    setSelection(nextSelection);
  }, [defaultTitle, dashboards, maxPlots]);

  if (!isOpen) {
    return null;
  }

  const submittingNewDashboard = selection === 'new';
  const canSubmit = title.trim().length > 0 && (!submittingNewDashboard ? !!selection : newDashboardName.trim().length > 0);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (submittingNewDashboard) {
      onSubmit({
        mode: 'new',
        dashboardName: newDashboardName.trim(),
        title: title.trim()
      });
    } else {
      onSubmit({
        mode: 'existing',
        dashboardId: selection,
        title: title.trim()
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="panel w-full max-w-md p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-semibold text-brand-text">
            <Pin size={18} />
            Pin chart to dashboard
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-icon btn-ghost"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-brand-muted">
            Chart title
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="brand-input mt-1 text-sm"
              placeholder="Chart title"
            />
          </label>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-brand-muted">
            Destination dashboard
          </label>
          {dashboards.length > 0 && (
            <select
              value={selection}
              onChange={(event) => setSelection(event.target.value)}
              className="brand-input text-sm"
            >
              {dashboards.map((dashboard) => (
                <option
                  key={dashboard.id}
                  value={dashboard.id}
                  disabled={dashboard.plotCount >= maxPlots}
                >
                  {dashboard.name} ({dashboard.plotCount}/{maxPlots}{dashboard.plotCount >= maxPlots ? ' full' : ''})
                </option>
              ))}
              <option value="new">+ Create new dashboard</option>
            </select>
          )}
          {dashboards.length === 0 && (
            <div className="text-sm text-gray-600">
              No dashboards available yet. Create a name below to get started.
            </div>
          )}
          {(dashboards.length === 0 || submittingNewDashboard) && (
            <input
              type="text"
              value={newDashboardName}
              onChange={(event) => setNewDashboardName(event.target.value)}
              placeholder="Dashboard name"
              className="brand-input text-sm"
            />
          )}
        </div>
        <div className="text-xs text-brand-muted">
          Each dashboard can hold up to {maxPlots} charts. Dashboards at capacity are disabled.
        </div>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-outline btn-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="btn btn-primary btn-sm"
          >
            Pin chart
          </button>
        </div>
      </form>
    </div>
  );
};
