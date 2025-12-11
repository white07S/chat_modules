import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  agentType: text('agent_type').notNull(),
  title: text('title'),
  lastUserMessage: text('last_user_message'),
  lastAgentMessage: text('last_agent_message'),
  lastClientId: text('last_client_id'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
});

export const threadEvents = sqliteTable(
  'thread_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    jobId: text('job_id').notNull(),
    eventType: text('event_type').notNull(),
    eventPayload: text('event_payload').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => ({
    threadIdx: index('idx_thread_events_thread_id').on(table.threadId)
  })
);

export const dashboards = sqliteTable('dashboards', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
});

export const dashboardPlots = sqliteTable(
  'dashboard_plots',
  {
    id: text('id').primaryKey(),
    dashboardId: text('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    chartSpec: text('chart_spec').notNull(),
    chartOption: text('chart_option'),
    agentType: text('agent_type'),
    sourceThreadId: text('source_thread_id'),
    sourceEventId: text('source_event_id'),
    layoutX: integer('layout_x').notNull().default(0),
    layoutY: integer('layout_y').notNull().default(0),
    layoutW: integer('layout_w').notNull().default(6),
    layoutH: integer('layout_h').notNull().default(6),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => ({
    dashboardIdx: index('idx_dashboard_plots_dashboard_id').on(table.dashboardId)
  })
);

export const agentKnowledge = sqliteTable(
  'agent_knowledge',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    agentType: text('agent_type'),
    threadId: text('thread_id'),
    messageId: text('message_id'),
    sqlText: text('sql_text').notNull(),
    sqlHash: text('sql_hash').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => ({
    threadIdx: index('idx_agent_knowledge_thread_id').on(table.threadId),
    agentIdx: index('idx_agent_knowledge_agent_type').on(table.agentType),
    hashUnique: uniqueIndex('idx_agent_knowledge_sql_hash').on(table.sqlHash)
  })
);

export type ThreadRow = typeof threads.$inferSelect;
export type ThreadEventRow = typeof threadEvents.$inferSelect;
export type DashboardRow = typeof dashboards.$inferSelect;
export type DashboardPlotRow = typeof dashboardPlots.$inferSelect;
export type AgentKnowledgeRow = typeof agentKnowledge.$inferSelect;
