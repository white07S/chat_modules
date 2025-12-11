import { asc, desc, eq, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getDb, persistDatabase } from './db.js';
import { dashboardPlots, dashboards } from './schema.js';
export const MAX_PLOTS_PER_DASHBOARD = 6;
export class DashboardStore {
    databaseProvider;
    constructor(databaseProvider = getDb) {
        this.databaseProvider = databaseProvider;
    }
    db() {
        return this.databaseProvider();
    }
    async listDashboards() {
        const database = this.db();
        const rows = await database
            .select({
            id: dashboards.id,
            name: dashboards.name,
            createdAt: dashboards.createdAt,
            updatedAt: dashboards.updatedAt,
            plotCount: sql `count(${dashboardPlots.id})`
        })
            .from(dashboards)
            .leftJoin(dashboardPlots, eq(dashboardPlots.dashboardId, dashboards.id))
            .groupBy(dashboards.id)
            .orderBy(desc(dashboards.updatedAt));
        return rows.map((row) => ({
            id: row.id,
            name: row.name,
            plotCount: Number(row.plotCount ?? 0),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        }));
    }
    async createDashboard(payload) {
        const database = this.db();
        const now = new Date().toISOString();
        const id = uuidv4();
        await database.insert(dashboards).values({
            id,
            name: payload.name,
            createdAt: now,
            updatedAt: now
        });
        await persistDatabase();
        return {
            id,
            name: payload.name,
            plotCount: 0,
            createdAt: now,
            updatedAt: now
        };
    }
    async getDashboard(id) {
        const database = this.db();
        const rows = await database
            .select()
            .from(dashboards)
            .where(eq(dashboards.id, id))
            .limit(1);
        const dashboard = rows[0];
        if (!dashboard) {
            return null;
        }
        const plots = await database
            .select()
            .from(dashboardPlots)
            .where(eq(dashboardPlots.dashboardId, id))
            .orderBy(asc(dashboardPlots.createdAt));
        return {
            dashboard: {
                id: dashboard.id,
                name: dashboard.name,
                plotCount: plots.length,
                createdAt: dashboard.createdAt,
                updatedAt: dashboard.updatedAt
            },
            plots: plots.map(this.mapPlotRow)
        };
    }
    async updateDashboard(id, updates) {
        if (!updates.name)
            return;
        const database = this.db();
        await database
            .update(dashboards)
            .set({
            name: updates.name,
            updatedAt: new Date().toISOString()
        })
            .where(eq(dashboards.id, id));
        await persistDatabase();
    }
    async deleteDashboard(id) {
        const database = this.db();
        await database.delete(dashboards).where(eq(dashboards.id, id));
        await persistDatabase();
    }
    async addPlot(payload) {
        await this.ensureCapacity(payload.dashboardId);
        const database = this.db();
        const now = new Date().toISOString();
        const id = uuidv4();
        const layout = this.normalizeLayout(payload.layout);
        await database.insert(dashboardPlots).values({
            id,
            dashboardId: payload.dashboardId,
            title: payload.title,
            chartSpec: JSON.stringify(payload.chartSpec ?? {}),
            chartOption: payload.chartOption ? JSON.stringify(payload.chartOption) : null,
            agentType: payload.agentType ?? null,
            sourceThreadId: payload.sourceThreadId ?? null,
            sourceEventId: payload.sourceEventId ?? null,
            layoutX: layout.x,
            layoutY: layout.y,
            layoutW: layout.w,
            layoutH: layout.h,
            createdAt: now,
            updatedAt: now
        });
        await persistDatabase();
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
    async getPlot(plotId) {
        const database = this.db();
        const rows = await database
            .select()
            .from(dashboardPlots)
            .where(eq(dashboardPlots.id, plotId))
            .limit(1);
        const row = rows[0];
        return row ? this.mapPlotRow(row) : null;
    }
    async updatePlot(plotId, updates) {
        const database = this.db();
        const rows = await database
            .select()
            .from(dashboardPlots)
            .where(eq(dashboardPlots.id, plotId))
            .limit(1);
        const existing = rows[0];
        if (!existing) {
            return null;
        }
        const targetDashboardId = updates.dashboardId ?? existing.dashboardId;
        if (targetDashboardId !== existing.dashboardId) {
            await this.ensureCapacity(targetDashboardId);
        }
        const layout = this.normalizeLayout(updates.layout, {
            x: existing.layoutX ?? 0,
            y: existing.layoutY ?? 0,
            w: existing.layoutW ?? 6,
            h: existing.layoutH ?? 6
        });
        const payload = {
            dashboardId: targetDashboardId,
            layoutX: layout.x,
            layoutY: layout.y,
            layoutW: layout.w,
            layoutH: layout.h,
            updatedAt: new Date().toISOString()
        };
        if (typeof updates.title === 'string') {
            payload.title = updates.title;
        }
        if (updates.chartSpec) {
            payload.chartSpec = JSON.stringify(updates.chartSpec);
        }
        if (updates.chartOption !== undefined) {
            payload.chartOption = updates.chartOption ? JSON.stringify(updates.chartOption) : null;
        }
        await database
            .update(dashboardPlots)
            .set(payload)
            .where(eq(dashboardPlots.id, plotId));
        await persistDatabase();
        return this.getPlot(plotId);
    }
    async deletePlot(plotId) {
        const database = this.db();
        await database.delete(dashboardPlots).where(eq(dashboardPlots.id, plotId));
        await persistDatabase();
    }
    async ensureCapacity(dashboardId) {
        const database = this.db();
        const rows = await database
            .select({
            count: sql `count(${dashboardPlots.id})`
        })
            .from(dashboardPlots)
            .where(eq(dashboardPlots.dashboardId, dashboardId));
        const count = Number(rows[0]?.count ?? 0);
        if (count >= MAX_PLOTS_PER_DASHBOARD) {
            throw new Error('Dashboard is at capacity');
        }
    }
    normalizeLayout(layout, fallback) {
        return {
            x: layout?.x ?? fallback?.x ?? 0,
            y: layout?.y ?? fallback?.y ?? 0,
            w: layout?.w ?? fallback?.w ?? 6,
            h: layout?.h ?? fallback?.h ?? 6
        };
    }
    mapPlotRow = (row) => {
        let chartSpec = {};
        let chartOption = null;
        try {
            chartSpec = row.chartSpec ? JSON.parse(row.chartSpec) : {};
        }
        catch {
            chartSpec = {};
        }
        try {
            chartOption = row.chartOption ? JSON.parse(row.chartOption) : null;
        }
        catch {
            chartOption = null;
        }
        return {
            id: row.id,
            dashboardId: row.dashboardId,
            title: row.title,
            chartSpec,
            chartOption,
            agentType: row.agentType ?? undefined,
            sourceThreadId: row.sourceThreadId ?? null,
            sourceEventId: row.sourceEventId ?? null,
            layout: {
                x: row.layoutX ?? 0,
                y: row.layoutY ?? 0,
                w: row.layoutW ?? 6,
                h: row.layoutH ?? 6
            },
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        };
    };
}
//# sourceMappingURL=DashboardStore.js.map