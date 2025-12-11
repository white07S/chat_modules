import crypto from 'crypto';
import { inArray } from 'drizzle-orm';
import { getDb, persistDatabase } from './db.js';
import { logger } from './logger.js';
import { agentKnowledge } from './schema.js';
const computeSqlHash = (sql) => {
    return crypto.createHash('sha256').update(sql.trim()).digest('hex');
};
export const saveKnowledgeEntries = async (entries) => {
    if (entries.length === 0) {
        return { saved: 0, duplicates: 0 };
    }
    const prepared = entries
        .map((entry) => {
        const normalizedSql = (entry.sql || '').trim();
        const sqlHash = normalizedSql ? computeSqlHash(normalizedSql) : '';
        return {
            agentType: entry.agentType ?? null,
            threadId: entry.threadId ?? null,
            messageId: entry.messageId ?? null,
            sqlText: normalizedSql,
            sqlHash
        };
    })
        .filter((entry) => Boolean(entry.sqlText));
    if (prepared.length === 0) {
        return { saved: 0, duplicates: 0 };
    }
    const dedupMap = new Map();
    prepared.forEach((entry) => {
        if (!dedupMap.has(entry.sqlHash)) {
            dedupMap.set(entry.sqlHash, entry);
        }
    });
    const dedupedPrepared = Array.from(dedupMap.values());
    const duplicatesFromPayload = prepared.length - dedupedPrepared.length;
    const database = getDb();
    const uniqueHashes = dedupedPrepared.map((entry) => entry.sqlHash);
    const existingRows = uniqueHashes.length === 0
        ? []
        : await database
            .select({ sqlHash: agentKnowledge.sqlHash })
            .from(agentKnowledge)
            .where(inArray(agentKnowledge.sqlHash, uniqueHashes));
    const existingHashes = new Set((existingRows || []).map((row) => row.sqlHash));
    const rowsToInsert = dedupedPrepared
        .filter((entry) => !existingHashes.has(entry.sqlHash))
        .map((entry) => ({
        agentType: entry.agentType,
        threadId: entry.threadId,
        messageId: entry.messageId,
        sqlText: entry.sqlText,
        sqlHash: entry.sqlHash,
        createdAt: new Date().toISOString()
    }));
    const duplicates = duplicatesFromPayload + (dedupedPrepared.length - rowsToInsert.length);
    try {
        if (rowsToInsert.length > 0) {
            await database.insert(agentKnowledge).values(rowsToInsert);
            await persistDatabase();
        }
        logger.info({ event: 'knowledge_saved', count: rowsToInsert.length, duplicates }, 'Processed knowledge entries');
        return { saved: rowsToInsert.length, duplicates };
    }
    catch (error) {
        logger.error({
            event: 'knowledge_save_error',
            error: error instanceof Error ? error.message : String(error)
        }, 'Failed to save knowledge entries');
        throw error;
    }
};
//# sourceMappingURL=KnowledgeStore.js.map