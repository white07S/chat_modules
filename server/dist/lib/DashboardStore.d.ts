import type { Database } from './db.js';
export declare const MAX_PLOTS_PER_DASHBOARD = 6;
export interface DashboardSummary {
    id: string;
    name: string;
    plotCount: number;
    createdAt: string;
    updatedAt: string;
}
export interface DashboardPlot {
    id: string;
    dashboardId: string;
    title: string;
    chartSpec: Record<string, unknown>;
    chartOption?: Record<string, unknown> | null;
    agentType?: string | null;
    sourceThreadId?: string | null;
    sourceEventId?: string | null;
    layout: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    createdAt: string;
    updatedAt: string;
}
export interface DashboardDetails {
    dashboard: DashboardSummary;
    plots: DashboardPlot[];
}
interface CreateDashboardPayload {
    name: string;
}
export interface CreatePlotPayload {
    dashboardId: string;
    title: string;
    chartSpec: Record<string, unknown>;
    chartOption?: Record<string, unknown> | null;
    agentType?: string;
    sourceThreadId?: string | null;
    sourceEventId?: string | null;
    layout?: Partial<DashboardPlot['layout']>;
}
export interface UpdatePlotPayload {
    dashboardId?: string;
    title?: string;
    chartSpec?: Record<string, unknown>;
    chartOption?: Record<string, unknown> | null;
    layout?: Partial<DashboardPlot['layout']>;
}
export declare class DashboardStore {
    private databaseProvider;
    constructor(databaseProvider?: () => Database);
    private db;
    listDashboards(): Promise<DashboardSummary[]>;
    createDashboard(payload: CreateDashboardPayload): Promise<DashboardSummary>;
    getDashboard(id: string): Promise<DashboardDetails | null>;
    updateDashboard(id: string, updates: Partial<CreateDashboardPayload>): Promise<void>;
    deleteDashboard(id: string): Promise<void>;
    addPlot(payload: CreatePlotPayload): Promise<DashboardPlot>;
    getPlot(plotId: string): Promise<DashboardPlot | null>;
    updatePlot(plotId: string, updates: UpdatePlotPayload): Promise<DashboardPlot | null>;
    deletePlot(plotId: string): Promise<void>;
    private ensureCapacity;
    private normalizeLayout;
    private mapPlotRow;
}
export {};
//# sourceMappingURL=DashboardStore.d.ts.map