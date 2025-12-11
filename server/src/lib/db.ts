import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import initSqlJs, { type Database as SqlJsRawDatabase, type SqlJsStatic } from 'sql.js';
import { drizzle, type SQLJsDatabase } from 'drizzle-orm/sql-js';
import { logger } from './logger.js';
import * as schema from './schema.js';

const require = createRequire(import.meta.url);

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

export type Database = SQLJsDatabase<typeof schema>;

let sqlJsInstance: SqlJsStatic | null = null;
let sqlJsDatabase: SqlJsRawDatabase | null = null;
let drizzleDb: Database | null = null;
let initializationPromise: Promise<void> | null = null;

const locateWasmFile = (file: string): string => {
  const wasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));
  return path.join(wasmDir, file);
};

const ensureDatabase = async (): Promise<void> => {
  if (drizzleDb) {
    return;
  }
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    sqlJsInstance = await initSqlJs({ locateFile: locateWasmFile });

    const existing = fs.existsSync(databasePath)
      ? new Uint8Array(fs.readFileSync(databasePath))
      : null;
    sqlJsDatabase = existing ? new sqlJsInstance.Database(existing) : new sqlJsInstance.Database();

    drizzleDb = drizzle(sqlJsDatabase, { schema });

    await initializeSchema();
    await persistDatabase();
  })().catch((error) => {
    drizzleDb = null;
    sqlJsDatabase = null;
    initializationPromise = null;
    logger.error({
      event: 'db_init_failed',
      error: error instanceof Error ? error.message : String(error)
    }, 'Failed to initialize SQL.js database');
    throw error;
  });

  return initializationPromise;
};

const initializeSchema = async (): Promise<void> => {
  if (!sqlJsDatabase) {
    throw new Error('SQL.js database is not ready');
  }

  sqlJsDatabase.run('PRAGMA foreign_keys = ON');

  const statements = [
    `CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      agent_type TEXT NOT NULL,
      title TEXT,
      last_user_message TEXT,
      last_agent_message TEXT,
      last_client_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS thread_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE INDEX IF NOT EXISTS idx_thread_events_thread_id ON thread_events(thread_id);`,
    `CREATE TABLE IF NOT EXISTS dashboards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS dashboard_plots (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      chart_spec TEXT NOT NULL,
      chart_option TEXT,
      agent_type TEXT,
      source_thread_id TEXT,
      source_event_id TEXT,
      layout_x INTEGER NOT NULL DEFAULT 0,
      layout_y INTEGER NOT NULL DEFAULT 0,
      layout_w INTEGER NOT NULL DEFAULT 6,
      layout_h INTEGER NOT NULL DEFAULT 6,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE INDEX IF NOT EXISTS idx_dashboard_plots_dashboard_id ON dashboard_plots(dashboard_id);`,
    `CREATE TABLE IF NOT EXISTS agent_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_type TEXT,
      thread_id TEXT,
      message_id TEXT,
      sql_text TEXT NOT NULL,
      sql_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_knowledge_sql_hash ON agent_knowledge(sql_hash);`,
    `CREATE INDEX IF NOT EXISTS idx_agent_knowledge_thread_id ON agent_knowledge(thread_id);`,
    `CREATE INDEX IF NOT EXISTS idx_agent_knowledge_agent_type ON agent_knowledge(agent_type);`
  ];

  for (const statement of statements) {
    sqlJsDatabase.run(statement);
  }

  logger.info({ event: 'db_schema_ready' }, 'Ensured SQL.js schema exists');
};

export const persistDatabase = async (): Promise<void> => {
  if (!sqlJsDatabase) return;
  const data = sqlJsDatabase.export();
  await fs.promises.writeFile(databasePath, Buffer.from(data));
};

export const getDb = (): Database => {
  if (!drizzleDb) {
    throw new Error('Database not initialized. Call initializeDatabase() before using it.');
  }
  return drizzleDb;
};

export const initializeDatabase = async (): Promise<void> => {
  await ensureDatabase();
};
