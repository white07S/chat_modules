import knex, { Knex } from 'knex';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from './logger.js';

const resolveDatabasePath = (): string => {
  const configuredPath = process.env.SQLITE_DB_PATH;
  const basePath = configuredPath
    ? path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath)
    : path.resolve(process.cwd(), 'data/codex_chat.sqlite');

  const dir = path.dirname(basePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return basePath;
};

const databasePath = resolveDatabasePath();

export const db: Knex = knex({
  client: 'sqlite3',
  connection: {
    filename: databasePath
  },
  useNullAsDefault: true
});

export const initializeDatabase = async (): Promise<void> => {
  await db.raw('PRAGMA foreign_keys = ON');

  const hasThreads = await db.schema.hasTable('threads');
  if (!hasThreads) {
    await db.schema.createTable('threads', (table) => {
      table.string('id').primary();
      table.string('agent_type').notNullable();
      table.string('title');
      table.text('last_user_message');
      table.text('last_agent_message');
      table.string('last_client_id');
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
    logger.info({ event: 'db_schema', table: 'threads' }, 'Created threads table');
  }

  const hasThreadEvents = await db.schema.hasTable('thread_events');
  if (!hasThreadEvents) {
    await db.schema.createTable('thread_events', (table) => {
      table.increments('id').primary();
      table.string('thread_id').notNullable().references('threads.id').onDelete('CASCADE');
      table.string('job_id').notNullable();
      table.string('event_type').notNullable();
      table.text('event_payload').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.index(['thread_id'], 'idx_thread_events_thread_id');
    });
    logger.info({ event: 'db_schema', table: 'thread_events' }, 'Created thread_events table');
  }

  const hasDashboards = await db.schema.hasTable('dashboards');
  if (!hasDashboards) {
    await db.schema.createTable('dashboards', (table) => {
      table.string('id').primary();
      table.string('name').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
    logger.info({ event: 'db_schema', table: 'dashboards' }, 'Created dashboards table');
  }

  const hasDashboardPlots = await db.schema.hasTable('dashboard_plots');
  if (!hasDashboardPlots) {
    await db.schema.createTable('dashboard_plots', (table) => {
      table.string('id').primary();
      table.string('dashboard_id').notNullable().references('dashboards.id').onDelete('CASCADE');
      table.string('title').notNullable();
      table.text('chart_spec').notNullable();
      table.text('chart_option');
      table.string('agent_type');
      table.string('source_thread_id');
      table.string('source_event_id');
      table.integer('layout_x').defaultTo(0);
      table.integer('layout_y').defaultTo(0);
      table.integer('layout_w').defaultTo(6);
      table.integer('layout_h').defaultTo(6);
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
      table.index(['dashboard_id'], 'idx_dashboard_plots_dashboard_id');
    });
    logger.info({ event: 'db_schema', table: 'dashboard_plots' }, 'Created dashboard_plots table');
  }

  const hasAgentKnowledge = await db.schema.hasTable('agent_knowledge');
  if (!hasAgentKnowledge) {
    await db.schema.createTable('agent_knowledge', (table) => {
      table.increments('id').primary();
      table.string('agent_type');
      table.string('thread_id');
      table.string('message_id');
      table.text('sql_text').notNullable();
      table.string('sql_hash', 64).notNullable().unique('idx_agent_knowledge_sql_hash');
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.index(['thread_id'], 'idx_agent_knowledge_thread_id');
      table.index(['agent_type'], 'idx_agent_knowledge_agent_type');
    });
    logger.info({ event: 'db_schema', table: 'agent_knowledge' }, 'Created agent_knowledge table');
  } else {
    const hasSqlHashColumn = await db.schema.hasColumn('agent_knowledge', 'sql_hash');
    if (!hasSqlHashColumn) {
      await db.schema.alterTable('agent_knowledge', (table) => {
        table.string('sql_hash', 64);
      });

      const existingRows: Array<{ id: number; sql_text: string }> = await db('agent_knowledge')
        .select('id', 'sql_text')
        .whereNull('sql_hash');

      for (const row of existingRows) {
        const hash = crypto.createHash('sha256').update(row.sql_text || '').digest('hex');
        await db('agent_knowledge')
          .where('id', row.id)
          .update({ sql_hash: hash });
      }

      logger.info({ event: 'db_schema', table: 'agent_knowledge' }, 'Added sql_hash column to agent_knowledge table');
    }
  }
};
