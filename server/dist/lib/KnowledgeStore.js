import crypto from 'crypto';
import { db } from './db.js';
import { logger } from './logger.js';
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
    const uniqueHashes = dedupedPrepared.map((entry) => entry.sqlHash);
    const existingRows = uniqueHashes.length === 0
        ? []
        : await db('agent_knowledge').select('sql_hash').whereIn('sql_hash', uniqueHashes);
    const existingHashes = new Set((existingRows || []).map((row) => row.sql_hash));
    const rowsToInsert = dedupedPrepared
        .filter((entry) => !existingHashes.has(entry.sqlHash))
        .map((entry) => ({
        agent_type: entry.agentType,
        thread_id: entry.threadId,
        message_id: entry.messageId,
        sql_text: entry.sqlText,
        sql_hash: entry.sqlHash,
        created_at: db.fn.now()
    }));
    const duplicates = duplicatesFromPayload + (dedupedPrepared.length - rowsToInsert.length);
    try {
        if (rowsToInsert.length > 0) {
            await db('agent_knowledge').insert(rowsToInsert);
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