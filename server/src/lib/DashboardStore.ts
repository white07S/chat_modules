import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';

export const MAX_PLOTS_PER_DASHBOARD = 6;

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

export class DashboardStore {
  private knex: Knex;

  constructor(knexInstance: Knex = db) {
    this.knex = knexInstance;
  }

  async listDashboards(): Promise<DashboardSummary[]> {
    const rows = await this.knex('dashboards as d')
      .leftJoin('dashboard_plots as p', 'd.id', 'p.dashboard_id')
      .select(
        'd.id',
        'd.name',
        'd.created_at as createdAt',
        'd.updated_at as updatedAt'
      )
      .count<{ plotCount: number }>({ plotCount: 'p.id' })
      .groupBy('d.id')
      .orderBy('d.updated_at', 'desc') as unknown as Array<any>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      plotCount: Number(row.plotCount ?? 0),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));
  }

  async createDashboard(payload: CreateDashboardPayload): Promise<DashboardSummary> {
    const now = new Date().toISOString();
    const id = uuidv4();
    await this.knex('dashboards').insert({
      id,
      name: payload.name,
      created_at: now,
      updated_at: now
    });

    return {
      id,
      name: payload.name,
      plotCount: 0,
      createdAt: now,
      updatedAt: now
    };
  }

  async getDashboard(id: string): Promise<DashboardDetails | null> {
    const dashboard = await this.knex('dashboards').where({ id }).first();
    if (!dashboard) {
      return null;
    }

    const plots = await this.knex('dashboard_plots')
      .where({ dashboard_id: id })
      .orderBy('created_at', 'asc');

    return {
      dashboard: {
        id: dashboard.id,
        name: dashboard.name,
        plotCount: plots.length,
        createdAt: dashboard.created_at,
        updatedAt: dashboard.updated_at
      },
      plots: plots.map(this.mapPlotRow)
    };
  }

  async updateDashboard(id: string, updates: Partial<CreateDashboardPayload>): Promise<void> {
    if (!updates.name) return;
    await this.knex('dashboards')
      .where({ id })
      .update({
        name: updates.name,
        updated_at: new Date().toISOString()
      });
  }

  async deleteDashboard(id: string): Promise<void> {
    await this.knex('dashboards').where({ id }).delete();
  }

  async addPlot(payload: CreatePlotPayload): Promise<DashboardPlot> {
    await this.ensureCapacity(payload.dashboardId);

    const now = new Date().toISOString();
    const id = uuidv4();
    const layout = this.normalizeLayout(payload.layout);

    await this.knex('dashboard_plots').insert({
      id,
      dashboard_id: payload.dashboardId,
      title: payload.title,
      chart_spec: JSON.stringify(payload.chartSpec ?? {}),
      chart_option: payload.chartOption ? JSON.stringify(payload.chartOption) : null,
      agent_type: payload.agentType ?? null,
      source_thread_id: payload.sourceThreadId ?? null,
      source_event_id: payload.sourceEventId ?? null,
      layout_x: layout.x,
      layout_y: layout.y,
      layout_w: layout.w,
      layout_h: layout.h,
      created_at: now,
      updated_at: now
    });

    return {
      id,
      dashboardId: payload.dashboardId,
      title: payload.title,
      chartSpec: payload.chartSpec ?? {},
      chartOption: payload.chartOption ?? null,
      agentType: payload.agentType,
      sourceThreadId: payload.sourceThreadId ?? null,
      sourceEventId: payload.sourceEventId ?? null,
      layout,
      createdAt: now,
      updatedAt: now
    };
  }

  async getPlot(plotId: string): Promise<DashboardPlot | null> {
    const row = await this.knex('dashboard_plots').where({ id: plotId }).first();
    return row ? this.mapPlotRow(row) : null;
  }

  async updatePlot(plotId: string, updates: UpdatePlotPayload): Promise<DashboardPlot | null> {
    const existing = await this.knex('dashboard_plots').where({ id: plotId }).first();
    if (!existing) {
      return null;
    }

    const targetDashboardId = updates.dashboardId ?? existing.dashboard_id;
    if (targetDashboardId !== existing.dashboard_id) {
      await this.ensureCapacity(targetDashboardId);
    }

    const layout = this.normalizeLayout(updates.layout, {
      x: existing.layout_x,
      y: existing.layout_y,
      w: existing.layout_w,
      h: existing.layout_h
    });

    const payload: Record<string, unknown> = {
      dashboard_id: targetDashboardId,
      layout_x: layout.x,
      layout_y: layout.y,
      layout_w: layout.w,
      layout_h: layout.h,
      updated_at: new Date().toISOString()
    };

    if (typeof updates.title === 'string') {
      payload.title = updates.title;
    }
    if (updates.chartSpec) {
      payload.chart_spec = JSON.stringify(updates.chartSpec);
    }
    if (updates.chartOption !== undefined) {
      payload.chart_option = updates.chartOption ? JSON.stringify(updates.chartOption) : null;
    }

    await this.knex('dashboard_plots').where({ id: plotId }).update(payload);

    return this.getPlot(plotId);
  }

  async deletePlot(plotId: string): Promise<void> {
    await this.knex('dashboard_plots').where({ id: plotId }).delete();
  }

  private async ensureCapacity(dashboardId: string): Promise<void> {
    const row = await this.knex('dashboard_plots')
      .where({ dashboard_id: dashboardId })
      .count<{ count: number }>({ count: 'id' })
      .first();
    const count = Number(row?.count ?? 0);
    if (count >= MAX_PLOTS_PER_DASHBOARD) {
      throw new Error('Dashboard is at capacity');
    }
  }

  private normalizeLayout(
    layout?: Partial<DashboardPlot['layout']>,
    fallback?: DashboardPlot['layout']
  ): DashboardPlot['layout'] {
    return {
      x: layout?.x ?? fallback?.x ?? 0,
      y: layout?.y ?? fallback?.y ?? 0,
      w: layout?.w ?? fallback?.w ?? 6,
      h: layout?.h ?? fallback?.h ?? 6
    };
  }

  private mapPlotRow = (row: any): DashboardPlot => {
    let chartSpec: Record<string, unknown> = {};
    let chartOption: Record<string, unknown> | null = null;
    try {
      chartSpec = row.chart_spec ? JSON.parse(row.chart_spec) : {};
    } catch {
      chartSpec = {};
    }
    try {
      chartOption = row.chart_option ? JSON.parse(row.chart_option) : null;
    } catch {
      chartOption = null;
    }

    return {
      id: row.id,
      dashboardId: row.dashboard_id,
      title: row.title,
      chartSpec,
      chartOption,
      agentType: row.agent_type,
      sourceThreadId: row.source_thread_id,
      sourceEventId: row.source_event_id,
      layout: {
        x: row.layout_x ?? 0,
        y: row.layout_y ?? 0,
        w: row.layout_w ?? 6,
        h: row.layout_h ?? 6
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  };
}
