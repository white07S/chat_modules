import { type SQLJsDatabase } from 'drizzle-orm/sql-js';
import * as schema from './schema.js';
export type Database = SQLJsDatabase<typeof schema>;
export declare const persistDatabase: () => Promise<void>;
export declare const getDb: () => Database;
export declare const initializeDatabase: () => Promise<void>;
//# sourceMappingURL=db.d.ts.map