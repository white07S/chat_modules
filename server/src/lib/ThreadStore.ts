import { Knex } from 'knex';
import { db } from './db.js';
import { logger } from './logger.js';

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

const mapThreadRow = (row: any): PersistedThread => {
  if (!row) {
    throw new Error('Invalid thread row');
  }

  return {
    threadId: row.id,
    agentType: row.agent_type,
    title: row.title || row.last_user_message || `Thread ${row.id.slice(-6)}`,
    lastUserMessage: row.last_user_message,
    lastAgentMessage: row.last_agent_message,
    updatedAt: row.updated_at
  };
};

export class ThreadStore {
  private knex: Knex;

  constructor(knexInstance: Knex = db) {
    this.knex = knexInstance;
  }

  async upsertThread(payload: ThreadUpsertPayload): Promise<void> {
    const { id, agentType, title, lastUserMessage, lastAgentMessage, lastClientId } = payload;
    const now = new Date().toISOString();

    const existing = await this.knex('threads').where({ id }).first();
    if (existing) {
      const resolvedTitle = existing.title || title;
      await this.knex('threads')
        .where({ id })
        .update({
          agent_type: agentType,
          title: resolvedTitle,
          last_user_message: lastUserMessage ?? existing.last_user_message,
          last_agent_message: lastAgentMessage ?? existing.last_agent_message,
          last_client_id: lastClientId ?? existing.last_client_id,
          updated_at: now
        });
      return;
    }

    await this.knex('threads').insert({
      id,
      agent_type: agentType,
      title,
      last_user_message: lastUserMessage,
      last_agent_message: lastAgentMessage,
      last_client_id: lastClientId,
      created_at: now,
      updated_at: now
    });
  }

  async updateThreadMeta(threadId: string, updates: Partial<Omit<ThreadUpsertPayload, 'id' | 'agentType'>>): Promise<void> {
    if (!threadId) return;
    const payload: Record<string, unknown> = {};

    if (typeof updates.title === 'string') {
      payload.title = updates.title;
    }
    if (typeof updates.lastUserMessage === 'string') {
      payload.last_user_message = updates.lastUserMessage;
    }
    if (typeof updates.lastAgentMessage === 'string') {
      payload.last_agent_message = updates.lastAgentMessage;
    }
    if (typeof updates.lastClientId === 'string') {
      payload.last_client_id = updates.lastClientId;
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    payload.updated_at = new Date().toISOString();

    await this.knex('threads')
      .where({ id: threadId })
      .update(payload);
  }

  async appendEvent(threadId: string, jobId: string, event: any): Promise<void> {
    if (!threadId) {
      logger.warn({ event: 'thread_event_no_thread', jobId }, 'Unable to persist event without thread id');
      return;
    }

    await this.knex('thread_events').insert({
      thread_id: threadId,
      job_id: jobId,
      event_type: event.type,
      event_payload: JSON.stringify(event),
      created_at: new Date().toISOString()
    });
  }

  async listThreads(agentType?: string): Promise<PersistedThread[]> {
    const query = this.knex('threads').orderBy('updated_at', 'desc');
    if (agentType) {
      query.where({ agent_type: agentType });
    }

    const rows = await query.select();
    return rows.map(mapThreadRow);
  }

  async getThread(threadId: string): Promise<PersistedThread | null> {
    const row = await this.knex('threads').where({ id: threadId }).first();
    return row ? mapThreadRow(row) : null;
  }

  async getThreadEvents(threadId: string): Promise<any[]> {
    const rows = await this.knex('thread_events')
      .where({ thread_id: threadId })
      .orderBy('id', 'asc');

    return rows.map((row) => {
      let payload: any = row.event_payload;
      try {
        payload = JSON.parse(row.event_payload);
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
