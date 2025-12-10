import React, { useEffect, useState } from 'react';
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Pin chart to dashboard</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-gray-600">
            Chart title
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="Chart title"
            />
          </label>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-gray-600">
            Destination dashboard
          </label>
          {dashboards.length > 0 && (
            <select
              value={selection}
              onChange={(event) => setSelection(event.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
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
              className="w-full border border-blue-300 rounded-md px-3 py-2 text-sm"
            />
          )}
        </div>
        <div className="text-xs text-gray-500">
          Each dashboard can hold up to {maxPlots} charts. Dashboards at capacity are disabled.
        </div>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className={`px-4 py-2 text-sm rounded-md text-white ${
              canSubmit ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300 cursor-not-allowed'
            }`}
          >
            Pin chart
          </button>
        </div>
      </form>
    </div>
  );
};
