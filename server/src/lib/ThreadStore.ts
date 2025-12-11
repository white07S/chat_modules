import { asc, desc, eq } from 'drizzle-orm';
import type { Database } from './db.js';
import { getDb, persistDatabase } from './db.js';
import { logger } from './logger.js';
import { threadEvents, threads, type ThreadRow } from './schema.js';

export interface PersistedThread {
  threadId: string;
  agentType: string;
  title?: string;
  lastUserMessage?: string | null;
  lastAgentMessage?: string | null;
  updatedAt: string;
}

interface ThreadUpsertPayload {
  id: string;
  agentType: string;
  title?: string;
  lastUserMessage?: string;
  lastAgentMessage?: string;
  lastClientId?: string;
}

const mapThreadRow = (row: ThreadRow): PersistedThread => {
  if (!row) {
    throw new Error('Invalid thread row');
  }

  return {
    threadId: row.id,
    agentType: row.agentType,
    title: row.title || row.lastUserMessage || `Thread ${row.id.slice(-6)}`,
    lastUserMessage: row.lastUserMessage,
    lastAgentMessage: row.lastAgentMessage,
    updatedAt: row.updatedAt
  };
};

export class ThreadStore {
  private databaseProvider: () => Database;

  constructor(databaseProvider: () => Database = getDb) {
    this.databaseProvider = databaseProvider;
  }

  private db(): Database {
    return this.databaseProvider();
  }

  async upsertThread(payload: ThreadUpsertPayload): Promise<void> {
    const { id, agentType, title, lastUserMessage, lastAgentMessage, lastClientId } = payload;
    const now = new Date().toISOString();
    const database = this.db();

    const existing = await database
      .select()
      .from(threads)
      .where(eq(threads.id, id))
      .limit(1);

    const existingRow = existing[0];

    if (existingRow) {
      const resolvedTitle = existingRow.title || title;
      await database
        .update(threads)
        .set({
          agentType,
          title: resolvedTitle,
          lastUserMessage: lastUserMessage ?? existingRow.lastUserMessage,
          lastAgentMessage: lastAgentMessage ?? existingRow.lastAgentMessage,
          lastClientId: lastClientId ?? existingRow.lastClientId,
          updatedAt: now
        })
        .where(eq(threads.id, id));
      await persistDatabase();
      return;
    }

    await database.insert(threads).values({
      id,
      agentType,
      title: title ?? null,
      lastUserMessage: lastUserMessage ?? null,
      lastAgentMessage: lastAgentMessage ?? null,
      lastClientId: lastClientId ?? null,
      createdAt: now,
      updatedAt: now
    });
    await persistDatabase();
  }

  async updateThreadMeta(threadId: string, updates: Partial<Omit<ThreadUpsertPayload, 'id' | 'agentType'>>): Promise<void> {
    if (!threadId) return;
    const database = this.db();
    const payload: Partial<ThreadRow> = {};

    if (typeof updates.title === 'string') {
      payload.title = updates.title ?? null;
    }
    if (typeof updates.lastUserMessage === 'string') {
      payload.lastUserMessage = updates.lastUserMessage ?? null;
    }
    if (typeof updates.lastAgentMessage === 'string') {
      payload.lastAgentMessage = updates.lastAgentMessage ?? null;
    }
    if (typeof updates.lastClientId === 'string') {
      payload.lastClientId = updates.lastClientId ?? null;
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    payload.updatedAt = new Date().toISOString();

    await database
      .update(threads)
      .set(payload)
      .where(eq(threads.id, threadId));
    await persistDatabase();
  }

  async appendEvent(threadId: string, jobId: string, event: any): Promise<void> {
    if (!threadId) {
      logger.warn({ event: 'thread_event_no_thread', jobId }, 'Unable to persist event without thread id');
      return;
    }

    const database = this.db();
    await database.insert(threadEvents).values({
      threadId,
      jobId,
      eventType: event.type,
      eventPayload: JSON.stringify(event),
      createdAt: new Date().toISOString()
    });
    await persistDatabase();
  }

  async listThreads(agentType?: string): Promise<PersistedThread[]> {
    const database = this.db();
    const rows = agentType
      ? await database
        .select()
        .from(threads)
        .where(eq(threads.agentType, agentType))
        .orderBy(desc(threads.updatedAt))
      : await database
        .select()
        .from(threads)
        .orderBy(desc(threads.updatedAt));
    return rows.map(mapThreadRow);
  }

  async getThread(threadId: string): Promise<PersistedThread | null> {
    const database = this.db();
    const rows = await database
      .select()
      .from(threads)
      .where(eq(threads.id, threadId))
      .limit(1);
    const row = rows[0];
    return row ? mapThreadRow(row) : null;
  }

  async getThreadEvents(threadId: string): Promise<any[]> {
    const database = this.db();
    const rows = await database
      .select()
      .from(threadEvents)
      .where(eq(threadEvents.threadId, threadId))
      .orderBy(asc(threadEvents.id));

    return rows.map((row) => {
      let payload: any = row.eventPayload;
      try {
        payload = JSON.parse(row.eventPayload);
      } catch (error) {
        logger.error({
          event: 'thread_event_parse_error',
          rowId: row.id,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to parse persisted event payload');
      }

      return payload;
    });
  }
}
