import type { Database } from './db.js';
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
export declare class ThreadStore {
    private databaseProvider;
    constructor(databaseProvider?: () => Database);
    private db;
    upsertThread(payload: ThreadUpsertPayload): Promise<void>;
    updateThreadMeta(threadId: string, updates: Partial<Omit<ThreadUpsertPayload, 'id' | 'agentType'>>): Promise<void>;
    appendEvent(threadId: string, jobId: string, event: any): Promise<void>;
    listThreads(agentType?: string): Promise<PersistedThread[]>;
    getThread(threadId: string): Promise<PersistedThread | null>;
    getThreadEvents(threadId: string): Promise<any[]>;
}
export {};
//# sourceMappingURL=ThreadStore.d.ts.map