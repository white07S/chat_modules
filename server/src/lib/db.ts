import knex, { Knex } from 'knex';
import fs from 'fs';
import path from 'path';
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
};
