import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DashboardDetailsResponse, DashboardSummary } from '../api';
import * as echarts from 'echarts';
import { Responsive as LegacyResponsive, WidthProvider } from 'react-grid-layout/legacy';
import { toPng } from 'html-to-image';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(LegacyResponsive);
type GridLayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

const buildChartOptionWithDownload = (option?: Record<string, unknown> | null) => {
  if (!option) return undefined;
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
  return normalized;
};

interface DashboardViewProps {
  details: DashboardDetailsResponse | null;
  dashboards: DashboardSummary[];
  isLoading: boolean;
  onMovePlot: (plotId: string, targetDashboardId: string) => void;
  onRemovePlot: (plotId: string) => void;
  onLayoutChange: (plotId: string, layout: { x: number; y: number; w: number; h: number }) => void;
  error?: string | null;
}

const PlotCard: React.FC<{
  plotId: string;
  title: string;
  agentType?: string | null;
  chartSpec?: Record<string, any>;
  chartOption?: Record<string, unknown> | null;
  dashboards: DashboardSummary[];
  dashboardId: string;
  onMove: (plotId: string, dashboardId: string) => void;
  onRemove: (plotId: string) => void;
}> = ({ plotId, title, agentType, chartSpec, chartOption, dashboards, dashboardId, onMove, onRemove }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const [selectedDestination, setSelectedDestination] = useState('');

  useEffect(() => {
    if (!chartRef.current) return;
    const baseOption = chartOption ?? (chartSpec as any)?.option;
    const option = buildChartOptionWithDownload(baseOption as Record<string, unknown>);
    if (!option) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
      return;
    }
    const chart = echarts.init(chartRef.current);
    chart.setOption(option);
    chartInstanceRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      chartInstanceRef.current?.resize();
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, [chartSpec, chartOption]);

  const moveTargets = dashboards.filter(d => d.id !== dashboardId);

  return (
    <div className="h-full w-full bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
      <div className="p-3 border-b border-gray-100 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-900 truncate">{title}</div>
          {agentType && <div className="text-xs text-gray-500">Agent: {agentType}</div>}
        </div>
        <div className="flex items-center gap-2">
          {moveTargets.length > 0 && (
            <>
              <select
                value={selectedDestination}
                onChange={(event) => setSelectedDestination(event.target.value)}
                className="text-xs border border-gray-300 rounded-md px-2 py-1"
              >
                <option value="">Move to...</option>
                {moveTargets.map(target => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (selectedDestination) {
                    onMove(plotId, selectedDestination);
                    setSelectedDestination('');
                  }
                }}
                disabled={!selectedDestination}
                className={`text-xs px-2 py-1 rounded-md border ${
                  selectedDestination
                    ? 'border-purple-500 text-purple-600 hover:bg-purple-50'
                    : 'border-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Move
              </button>
            </>
          )}
          <button
            onClick={() => onRemove(plotId)}
            className="text-xs text-red-600 hover:text-red-800"
          >
            Unpin
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-[200px]">
        <div ref={chartRef} className="w-full h-full" />
      </div>
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  details,
  dashboards,
  isLoading,
  onMovePlot,
  onRemovePlot,
  onLayoutChange,
  error
}) => {
  const dashboardRef = useRef<HTMLDivElement>(null);

  const plots = useMemo(() => details?.plots ?? [], [details]);

  const layoutItems = useMemo<GridLayoutItem[]>(() => {
    return plots.map((plot) => ({
      i: plot.id,
      x: plot.layout.x ?? 0,
      y: plot.layout.y ?? 0,
      w: plot.layout.w ?? 6,
      h: plot.layout.h ?? 6,
      minW: 3,
      minH: 4
    }));
  }, [plots]);

  const responsiveLayouts = useMemo<Record<string, GridLayoutItem[]>>(() => {
    const clone = (items: GridLayoutItem[]) => items.map(item => ({ ...item }));
    return {
      lg: clone(layoutItems),
      md: clone(layoutItems),
      sm: clone(layoutItems),
      xs: clone(layoutItems),
      xxs: clone(layoutItems)
    };
  }, [layoutItems]);

  const handleLayoutCommit = useCallback((layout: GridLayoutItem) => {
    onLayoutChange(layout.i, { x: layout.x, y: layout.y, w: layout.w, h: layout.h });
  }, [onLayoutChange]);

  const handleDownload = useCallback(async () => {
    if (!dashboardRef.current) return;
    try {
      const dataUrl = await toPng(dashboardRef.current, { pixelRatio: 2, cacheBust: true });
      const anchor = document.createElement('a');
      anchor.href = dataUrl;
      anchor.download = `${details?.dashboard.name || 'dashboard'}.png`;
      anchor.click();
    } catch (downloadError) {
      console.error('Failed to download dashboard:', downloadError);
    }
  }, [details]);

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-sm text-gray-500">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="flex-1 flex items-center justify-center text-sm text-red-600">{error}</div>;
  }

  if (!details) {
    return <div className="flex-1 flex items-center justify-center text-sm text-gray-500">Select a dashboard to view saved charts.</div>;
  }

  return (
    <div className="flex-1 flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-gray-900">{details.dashboard.name}</div>
          <div className="text-xs text-gray-500">{details.plots.length} chart(s) pinned</div>
        </div>
        <button
          onClick={handleDownload}
          className="px-3 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600"
        >
          Download PNG
        </button>
      </div>
      {plots.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg">
          Pin charts from viz_agent responses to build a dashboard.
        </div>
      ) : (
        <div ref={dashboardRef} className="flex-1">
          <ResponsiveGridLayout
            className="layout"
            rowHeight={30}
            margin={[16, 16]}
            layouts={responsiveLayouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 8, xs: 4, xxs: 2 }}
            onDragStop={(_layouts: any, __: any, layout: GridLayoutItem) => handleLayoutCommit(layout)}
            onResizeStop={(_layouts: any, __: any, layout: GridLayoutItem) => handleLayoutCommit(layout)}
            measureBeforeMount={false}
            useCSSTransforms
            compactType="vertical"
          >
            {plots.map((plot) => (
              <div key={plot.id} data-grid={{
                x: plot.layout.x ?? 0,
                y: plot.layout.y ?? 0,
                w: plot.layout.w ?? 6,
                h: plot.layout.h ?? 6,
                minW: 3,
                minH: 4
              }}>
                <PlotCard
                  plotId={plot.id}
                  title={plot.title}
                  agentType={plot.agentType}
                  chartSpec={plot.chartSpec}
                  chartOption={plot.chartOption}
                  dashboards={dashboards}
                  dashboardId={plot.dashboardId}
                  onMove={onMovePlot}
                  onRemove={onRemovePlot}
                />
              </div>
            ))}
          </ResponsiveGridLayout>
        </div>
      )}
    </div>
  );
};
