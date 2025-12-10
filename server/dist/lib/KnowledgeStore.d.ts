export interface KnowledgeEntryInput {
    agentType?: string | null;
    threadId?: string | null;
    messageId?: string | null;
    sql: string;
}
export interface KnowledgeSaveResult {
    saved: number;
    duplicates: number;
}
export declare const saveKnowledgeEntries: (entries: KnowledgeEntryInput[]) => Promise<KnowledgeSaveResult>;
//# sourceMappingURL=KnowledgeStore.d.ts.map