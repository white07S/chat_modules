import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './lib/logger.js';
import { AgentManager } from './lib/AgentManager.js';
import { SSEManager } from './lib/SSEManager.js';
// Load environment variables
config({ path: '.env.dev' });
class CodexChatServer {
    app;
    agentManager;
    sseManager;
    jobs = new Map();
    port;
    constructor() {
        this.app = express();
        this.agentManager = new AgentManager();
        this.sseManager = new SSEManager();
        this.port = parseInt(process.env.PORT || '3000', 10);
    }
    async initialize() {
        logger.info({ event: 'server_init' }, 'Initializing Codex Chat Server');
        // Initialize agent manager
        await this.agentManager.initialize();
        // Setup middleware
        this.setupMiddleware();
        // Setup routes
        this.setupRoutes();
        // Start cleanup interval
        this.startCleanupInterval();
    }
    setupMiddleware() {
        // CORS
        this.app.use(cors({
            origin: process.env.CORS_ORIGIN || '*',
            credentials: true
        }));
        // JSON parsing
        this.app.use(express.json({ limit: '50mb' }));
        // Request logging
        this.app.use((req, res, next) => {
            logger.info({
                event: 'http_request',
                method: req.method,
                path: req.path,
                query: req.query,
                ip: req.ip
            }, `${req.method} ${req.path}`);
            next();
        });
    }
    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            });
        });
        // SSE endpoint for streaming
        this.app.get('/stream/:clientId', (req, res) => {
            const { clientId } = req.params;
            const { agentType } = req.query;
            this.sseManager.addClient(clientId, res, agentType);
        });
        // List available agents
        this.app.get('/agents', (req, res) => {
            const agents = this.agentManager.getAvailableAgents();
            res.json({ agents });
        });
        // Get active threads
        this.app.get('/threads', (req, res) => {
            const threads = this.agentManager.getActiveThreads();
            res.json({ threads });
        });
        // Get job status
        this.app.get('/jobs/:jobId', (req, res) => {
            const job = this.jobs.get(req.params.jobId);
            if (!job) {
                res.status(404).json({ error: 'Job not found' });
                return;
            }
            res.json(job);
        });
        // Main chat endpoint
        this.app.post('/chat', async (req, res) => {
            try {
                const chatRequest = req.body;
                const { clientId, agentType, message, threadId, options } = chatRequest;
                // Validate request
                if (!clientId || !agentType || !message) {
                    res.status(400).json({ error: 'Missing required fields: clientId, agentType, message' });
                    return;
                }
                // Check if client is connected via SSE
                if (!this.sseManager.isClientConnected(clientId)) {
                    res.status(400).json({ error: 'Client not connected. Connect via SSE first.' });
                    return;
                }
                // Create job
                const jobId = uuidv4();
                const jobInfo = {
                    jobId,
                    clientId,
                    agentType,
                    threadId: threadId || '',
                    status: 'queued',
                    startTime: new Date()
                };
                this.jobs.set(jobId, jobInfo);
                // Queue for processing
                setImmediate(() => this.processChat(jobInfo, message, options));
                res.json({ jobId, status: 'queued' });
            }
            catch (error) {
                logger.error({
                    event: 'chat_endpoint_error',
                    error: error instanceof Error ? error.message : String(error)
                }, 'Error in chat endpoint');
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Resume thread endpoint
        this.app.post('/threads/resume', async (req, res) => {
            try {
                const { agentType, threadId } = req.body;
                if (!agentType || !threadId) {
                    res.status(400).json({ error: 'Missing required fields: agentType, threadId' });
                    return;
                }
                await this.agentManager.resumeThread(agentType, threadId);
                res.json({ status: 'resumed', threadId });
            }
            catch (error) {
                logger.error({
                    event: 'resume_thread_error',
                    error: error instanceof Error ? error.message : String(error)
                }, 'Error resuming thread');
                res.status(500).json({ error: 'Failed to resume thread' });
            }
        });
        // Stop chat/thread
        this.app.post('/stop/:jobId', (req, res) => {
            const job = this.jobs.get(req.params.jobId);
            if (!job) {
                res.status(404).json({ error: 'Job not found' });
                return;
            }
            // Mark as completed/stopped
            job.status = 'completed';
            job.endTime = new Date();
            // Notify client
            this.sseManager.sendToClient(job.clientId, {
                type: 'job_stopped',
                jobId: job.jobId,
                timestamp: new Date().toISOString()
            });
            res.json({ status: 'stopped' });
        });
    }
    async processChat(job, message, options) {
        try {
            // Update job status
            job.status = 'processing';
            logger.info({
                event: 'chat_processing_start',
                jobId: job.jobId,
                agentType: job.agentType
            }, 'Starting chat processing');
            // Get or create thread
            let thread;
            let actualThreadId;
            if (job.threadId) {
                // Try to get existing thread
                const existingThread = this.agentManager.getThread(job.threadId);
                if (existingThread) {
                    thread = existingThread.thread;
                    actualThreadId = job.threadId;
                    logger.info({
                        event: 'thread_reused',
                        threadId: job.threadId
                    }, 'Reusing existing thread');
                }
                else {
                    // Resume thread if not in memory
                    try {
                        thread = await this.agentManager.resumeThread(job.agentType, job.threadId);
                        actualThreadId = job.threadId;
                        logger.info({
                            event: 'thread_resumed',
                            threadId: job.threadId
                        }, 'Resumed thread from disk');
                    }
                    catch {
                        // Create new thread if resume fails
                        const result = this.agentManager.startThread(job.agentType);
                        thread = result.thread;
                        actualThreadId = result.threadId;
                        logger.warn({
                            event: 'thread_resume_failed_new_created',
                            oldThreadId: job.threadId,
                            newThreadId: actualThreadId
                        }, 'Failed to resume thread, created new one');
                    }
                }
            }
            else {
                // Create new thread
                const result = this.agentManager.startThread(job.agentType);
                thread = result.thread;
                actualThreadId = result.threadId;
                job.threadId = actualThreadId;
            }
            // Send thread info to client
            this.sseManager.sendToClient(job.clientId, {
                type: 'thread_info',
                jobId: job.jobId,
                threadId: actualThreadId,
                agentType: job.agentType,
                timestamp: new Date().toISOString()
            });
            // Process with streaming
            const { events } = await thread.runStreamed(message, options);
            // Stream events to client
            for await (const event of events) {
                // Transform and send event
                const transformedEvent = {
                    type: 'agent_event',
                    jobId: job.jobId,
                    agentType: job.agentType,
                    threadId: actualThreadId,
                    event: {
                        ...event,
                        timestamp: new Date().toISOString()
                    }
                };
                this.sseManager.sendToClient(job.clientId, transformedEvent);
                // Update thread activity
                this.agentManager.updateThreadActivity(actualThreadId);
                // Log significant events
                if (event.type === 'turn.completed' || event.type === 'item.completed') {
                    logger.info({
                        event: 'significant_agent_event',
                        jobId: job.jobId,
                        eventType: event.type,
                        usage: event.usage
                    }, `Significant event: ${event.type}`);
                }
            }
            // Mark job as completed
            job.status = 'completed';
            job.endTime = new Date();
            // Send completion event
            this.sseManager.sendToClient(job.clientId, {
                type: 'job_complete',
                jobId: job.jobId,
                threadId: actualThreadId,
                duration: job.endTime.getTime() - job.startTime.getTime(),
                timestamp: new Date().toISOString()
            });
            logger.info({
                event: 'chat_processing_complete',
                jobId: job.jobId,
                duration: job.endTime.getTime() - job.startTime.getTime()
            }, 'Chat processing completed');
        }
        catch (error) {
            // Handle errors
            job.status = 'error';
            job.endTime = new Date();
            job.error = error instanceof Error ? error.message : String(error);
            logger.error({
                event: 'chat_processing_error',
                jobId: job.jobId,
                error: job.error
            }, 'Chat processing failed');
            // Send error to client
            this.sseManager.sendToClient(job.clientId, {
                type: 'error',
                jobId: job.jobId,
                error: job.error,
                timestamp: new Date().toISOString()
            });
        }
    }
    startCleanupInterval() {
        // Clean up inactive threads every 5 minutes
        setInterval(() => {
            const cleaned = this.agentManager.cleanupInactiveThreads();
            if (cleaned > 0) {
                logger.info({
                    event: 'thread_cleanup',
                    count: cleaned
                }, `Cleaned up ${cleaned} inactive threads`);
            }
        }, 5 * 60 * 1000);
        // Clean up old jobs every hour
        setInterval(() => {
            const oneHourAgo = Date.now() - 60 * 60 * 1000;
            let cleaned = 0;
            this.jobs.forEach((job, jobId) => {
                if (job.endTime && job.endTime.getTime() < oneHourAgo) {
                    this.jobs.delete(jobId);
                    cleaned++;
                }
            });
            if (cleaned > 0) {
                logger.info({
                    event: 'job_cleanup',
                    count: cleaned
                }, `Cleaned up ${cleaned} old jobs`);
            }
        }, 60 * 60 * 1000);
    }
    async start() {
        await this.initialize();
        this.app.listen(this.port, () => {
            logger.info({
                event: 'server_started',
                port: this.port,
                host: process.env.HOST || 'localhost',
                nodeEnv: process.env.NODE_ENV
            }, `Codex Chat Server running on port ${this.port}`);
        });
    }
}
// Start server
const server = new CodexChatServer();
server.start().catch(error => {
    logger.error({
        event: 'server_start_error',
        error: error instanceof Error ? error.message : String(error)
    }, 'Failed to start server');
    process.exit(1);
});
//# sourceMappingURL=index.js.map