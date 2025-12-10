import pino from 'pino';
import fs from 'fs';
import path from 'path';
// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}
// Create JSONL logger
const logFile = process.env.LOG_FILE || './logs/server.jsonl';
const logLevel = process.env.LOG_LEVEL || 'info';
// Create a write stream for JSONL file
const logStream = fs.createWriteStream(path.resolve(logFile), { flags: 'a' });
// Create logger with both console and file output
export const logger = pino({
    level: logLevel,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
        level: (label) => {
            return { level: label };
        }
    },
    base: {
        pid: process.pid,
        hostname: process.env.HOST || 'localhost'
    }
}, pino.multistream([
    {
        stream: logStream,
        level: logLevel
    },
    {
        stream: pino.transport({
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss.l',
                ignore: 'pid,hostname'
            }
        }),
        level: logLevel
    }
]));
// Log startup
logger.info({
    event: 'server_startup',
    config: {
        logLevel,
        logFile: path.resolve(logFile)
    }
}, 'Logger initialized');
export default logger;
//# sourceMappingURL=logger.js.map