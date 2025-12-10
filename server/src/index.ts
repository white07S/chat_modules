import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Thread } from '@openai/codex-sdk';

import { logger } from './lib/logger.js';
import { AgentManager } from './lib/AgentManager.js';
import { SSEManager } from './lib/SSEManager.js';
import { initializeDatabase } from './lib/db.js';
import { ThreadStore } from './lib/ThreadStore.js';
import { DashboardStore, MAX_PLOTS_PER_DASHBOARD } from './lib/DashboardStore.js';
import { saveKnowledgeEntries } from './lib/KnowledgeStore.js';

// Load environment variables
config({ path: '.env.dev' });

interface ChatRequest {
  clientId: string;
  agentType: string;
  message: string;
  threadId?: string; // Optional: continue existing thread
  options?: {
    outputSchema?: any;
    multimodal?: Array<{ type: string; path?: string; text?: string }>;
  };
}

interface JobInfo {
  jobId: string;
  clientId: string;
  agentType: string;
  threadId: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  startTime: Date;
  endTime?: Date;
  error?: string;
}

class CodexChatServer {
  private app: express.Application;
  private agentManager: AgentManager;
  private sseManager: SSEManager;
  private threadStore: ThreadStore;
  private dashboardStore: DashboardStore;
  private jobs: Map<string, JobInfo> = new Map();
  private port: number;

  constructor() {
    this.app = express();
    this.agentManager = new AgentManager();
    this.sseManager = new SSEManager();
    this.threadStore = new ThreadStore();
    this.dashboardStore = new DashboardStore();
    this.port = parseInt(process.env.PORT || '3000', 10);
  }

  async initialize() {
    logger.info({ event: 'server_init' }, 'Initializing Codex Chat Server');

    await initializeDatabase();

    // Initialize agent manager
    await this.agentManager.initialize();

    // Setup middleware
    this.setupMiddleware();

    // Setup routes
    this.setupRoutes();

    // Start cleanup interval
    this.startCleanupInterval();
  }

  private setupMiddleware() {
    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }));

    // JSON parsing
    this.app.use(express.json({ limit: '50mb' }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
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

  private setupRoutes() {
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

      this.sseManager.addClient(clientId, res, agentType as string);
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

    // Persisted sessions & history
    this.app.get('/sessions', async (req, res) => {
      try {
        const agentType = typeof req.query.agentType === 'string' ? req.query.agentType : undefined;
        const threads = await this.threadStore.listThreads(agentType);
        res.json({ threads });
      } catch (error) {
        logger.error({
          event: 'sessions_list_error',
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to list sessions');
        res.status(500).json({ error: 'Failed to fetch sessions' });
      }
    });

    this.app.get('/sessions/:threadId/events', async (req, res) => {
      try {
        const threadId = req.params.threadId;
        const thread = await this.threadStore.getThread(threadId);
        if (!thread) {
          res.status(404).json({ error: 'Thread not found' });
          return;
        }

        const events = await this.threadStore.getThreadEvents(threadId);
        res.json({ thread, events });
      } catch (error) {
        logger.error({
          event: 'sessions_events_error',
          threadId: req.params.threadId,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to fetch session events');
        res.status(500).json({ error: 'Failed to fetch session events' });
      }
    });

    this.app.post('/knowledge', async (req, res) => {
      try {
        const { agentType, threadId, messageId, queries } = req.body || {};

        if (!Array.isArray(queries)) {
          res.status(400).json({ error: 'queries array is required' });
          return;
        }

        const normalizedQueries = queries
          .map((sql: unknown) => (typeof sql === 'string' ? sql.trim() : ''))
          .filter((sql: string) => sql.length > 0);

        if (normalizedQueries.length === 0) {
          res.status(400).json({ error: 'At least one SQL query is required' });
          return;
        }

        const { saved, duplicates } = await saveKnowledgeEntries(normalizedQueries.map((sql: string) => ({
          agentType: typeof agentType === 'string' ? agentType : null,
          threadId: typeof threadId === 'string' ? threadId : null,
          messageId: typeof messageId === 'string' ? messageId : null,
          sql
        })));

        res.status(201).json({ saved, duplicates });
      } catch (error) {
        logger.error({
          event: 'knowledge_save_failed',
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to save knowledge entries');
        res.status(500).json({ error: 'Failed to save knowledge entries' });
      }
    });

    // Dashboard endpoints
    this.app.get('/dashboards', async (_req, res) => {
      try {
        const dashboards = await this.dashboardStore.listDashboards();
        res.json({ dashboards, maxPlots: MAX_PLOTS_PER_DASHBOARD });
      } catch (error) {
        logger.error({
          event: 'dashboards_list_error',
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to list dashboards');
        res.status(500).json({ error: 'Failed to list dashboards' });
      }
    });

    this.app.post('/dashboards', async (req, res) => {
      try {
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        if (!name) {
          res.status(400).json({ error: 'Dashboard name is required' });
          return;
        }

        const dashboard = await this.dashboardStore.createDashboard({ name });
        res.status(201).json({ dashboard, maxPlots: MAX_PLOTS_PER_DASHBOARD });
      } catch (error) {
        logger.error({
          event: 'dashboard_create_error',
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to create dashboard');
        res.status(500).json({ error: 'Failed to create dashboard' });
      }
    });

    this.app.get('/dashboards/:dashboardId', async (req, res) => {
      try {
        const dashboard = await this.dashboardStore.getDashboard(req.params.dashboardId);
        if (!dashboard) {
          res.status(404).json({ error: 'Dashboard not found' });
          return;
        }
        res.json({ ...dashboard, maxPlots: MAX_PLOTS_PER_DASHBOARD });
      } catch (error) {
        logger.error({
          event: 'dashboard_detail_error',
          dashboardId: req.params.dashboardId,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to fetch dashboard details');
        res.status(500).json({ error: 'Failed to fetch dashboard details' });
      }
    });

    this.app.put('/dashboards/:dashboardId', async (req, res) => {
      try {
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        if (!name) {
          res.status(400).json({ error: 'Dashboard name is required' });
          return;
        }
        await this.dashboardStore.updateDashboard(req.params.dashboardId, { name });
        const dashboard = await this.dashboardStore.getDashboard(req.params.dashboardId);
        if (!dashboard) {
          res.status(404).json({ error: 'Dashboard not found' });
          return;
        }
        res.json({ ...dashboard, maxPlots: MAX_PLOTS_PER_DASHBOARD });
      } catch (error) {
        logger.error({
          event: 'dashboard_update_error',
          dashboardId: req.params.dashboardId,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to update dashboard');
        res.status(500).json({ error: 'Failed to update dashboard' });
      }
    });

    this.app.delete('/dashboards/:dashboardId', async (req, res) => {
      try {
        await this.dashboardStore.deleteDashboard(req.params.dashboardId);
        res.status(204).send();
      } catch (error) {
        logger.error({
          event: 'dashboard_delete_error',
          dashboardId: req.params.dashboardId,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to delete dashboard');
        res.status(500).json({ error: 'Failed to delete dashboard' });
      }
    });

    this.app.post('/dashboards/:dashboardId/plots', async (req, res) => {
      try {
        const dashboardId = req.params.dashboardId;
        const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
        if (!title) {
          res.status(400).json({ error: 'Plot title is required' });
          return;
        }

        const chartSpec = req.body?.chartSpec;
        if (!chartSpec || typeof chartSpec !== 'object') {
          res.status(400).json({ error: 'chartSpec is required' });
          return;
        }

        const chartOption = req.body?.chartOption && typeof req.body.chartOption === 'object'
          ? req.body.chartOption
          : null;

        const layout = req.body?.layout && typeof req.body.layout === 'object'
          ? req.body.layout
          : undefined;

        const plot = await this.dashboardStore.addPlot({
          dashboardId,
          title,
          chartSpec,
          chartOption,
          agentType: req.body?.agentType,
          sourceThreadId: req.body?.sourceThreadId,
          sourceEventId: req.body?.sourceEventId,
          layout
        });

        res.status(201).json({ plot });
      } catch (error) {
        const isCapacityError = error instanceof Error && /capacity/i.test(error.message);
        logger.error({
          event: 'dashboard_plot_create_error',
          dashboardId: req.params.dashboardId,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to add plot');
        res
          .status(isCapacityError ? 400 : 500)
          .json({
            error: isCapacityError ? 'Dashboard is at capacity' : 'Failed to add plot',
            maxPlots: MAX_PLOTS_PER_DASHBOARD
          });
      }
    });

    this.app.put('/dashboards/:dashboardId/plots/:plotId', async (req, res) => {
      try {
        const layout = req.body?.layout && typeof req.body.layout === 'object'
          ? req.body.layout
          : undefined;
        const targetDashboardId = typeof req.body?.dashboardId === 'string'
          ? req.body.dashboardId
          : req.params.dashboardId;

        const updates = await this.dashboardStore.updatePlot(req.params.plotId, {
          dashboardId: targetDashboardId,
          title: typeof req.body?.title === 'string' ? req.body.title : undefined,
          chartSpec: req.body?.chartSpec && typeof req.body.chartSpec === 'object'
            ? req.body.chartSpec
            : undefined,
          chartOption: req.body?.chartOption && typeof req.body.chartOption === 'object'
            ? req.body.chartOption
            : req.body?.chartOption === null
              ? null
              : undefined,
          layout
        });

        if (!updates) {
          res.status(404).json({ error: 'Plot not found' });
          return;
        }

        res.json({ plot: updates });
      } catch (error) {
        const isCapacityError = error instanceof Error && /capacity/i.test(error.message);
        logger.error({
          event: 'dashboard_plot_update_error',
          dashboardId: req.params.dashboardId,
          plotId: req.params.plotId,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to update plot');
        res
          .status(isCapacityError ? 400 : 500)
          .json({
            error: isCapacityError ? 'Dashboard is at capacity' : 'Failed to update plot',
            maxPlots: MAX_PLOTS_PER_DASHBOARD
          });
      }
    });

    this.app.delete('/dashboards/:dashboardId/plots/:plotId', async (req, res) => {
      try {
        await this.dashboardStore.deletePlot(req.params.plotId);
        res.status(204).send();
      } catch (error) {
        logger.error({
          event: 'dashboard_plot_delete_error',
          dashboardId: req.params.dashboardId,
          plotId: req.params.plotId,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to delete plot');
        res.status(500).json({ error: 'Failed to delete plot' });
      }
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
        const chatRequest: ChatRequest = req.body;
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
        const jobInfo: JobInfo = {
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

      } catch (error) {
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

      } catch (error) {
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

  private async processChat(job: JobInfo, message: string, options?: any) {
    try {
      // Update job status
      job.status = 'processing';
      logger.info({
        event: 'chat_processing_start',
        jobId: job.jobId,
        agentType: job.agentType
      }, 'Starting chat processing');

      // Get or create thread
      let thread: Thread;
      let actualThreadId: string | null = job.threadId || null;
      let threadMetadataPersisted = false;
      let userEventPersisted = false;

      const ensureUserEventPersisted = async () => {
        if (!userEventPersisted && threadMetadataPersisted && actualThreadId && !this.isTemporaryThreadId(actualThreadId)) {
          await this.persistUserMessageEvent(job, actualThreadId, message);
          userEventPersisted = true;
        }
      };

      if (job.threadId) {
        // Try to get existing thread
        const existingThread = this.agentManager.getThread(job.threadId);
        if (existingThread) {
          thread = existingThread.thread;
          logger.info({
            event: 'thread_reused',
            threadId: job.threadId
          }, 'Reusing existing thread');
        } else {
          // Resume thread if not in memory
          try {
            thread = await this.agentManager.resumeThread(job.agentType, job.threadId);
            logger.info({
              event: 'thread_resumed',
              threadId: job.threadId
            }, 'Resumed thread from disk');
          } catch {
            // Create new thread if resume fails
            const result = this.agentManager.startThread(job.agentType);
            thread = result.thread;
            actualThreadId = result.threadId;
            job.threadId = actualThreadId;
            logger.warn({
              event: 'thread_resume_failed_new_created',
              oldThreadId: job.threadId,
              newThreadId: actualThreadId
            }, 'Failed to resume thread, created new one');
          }
        }
      } else {
        // Create new thread
        const result = this.agentManager.startThread(job.agentType);
        thread = result.thread;
        actualThreadId = result.threadId;
        job.threadId = actualThreadId;
      }

      if (actualThreadId && !this.isTemporaryThreadId(actualThreadId)) {
        const persistedThreadId = actualThreadId;
        await this.safeThreadOperation(() => this.threadStore.upsertThread({
          id: persistedThreadId,
          agentType: job.agentType,
          title: message.slice(0, 120),
          lastUserMessage: message,
          lastClientId: job.clientId
        }), { event: 'thread_upsert_error', threadId: persistedThreadId });
        threadMetadataPersisted = true;

        this.sseManager.sendToClient(job.clientId, {
          type: 'thread_info',
          jobId: job.jobId,
          threadId: persistedThreadId,
          agentType: job.agentType,
          timestamp: new Date().toISOString()
        });

        await ensureUserEventPersisted();
      }

      // Process with streaming
      const { events } = await thread.runStreamed(message, options);

      // Stream events to client
      for await (const event of events) {
        if (!threadMetadataPersisted && event.type === 'thread.started' && event.thread_id) {
          if (!actualThreadId || actualThreadId !== event.thread_id) {
            if (actualThreadId) {
              this.agentManager.updateThreadId(actualThreadId, event.thread_id);
            }
            actualThreadId = event.thread_id;
            job.threadId = event.thread_id;
          }

          const persistedThreadId = event.thread_id;
          await this.safeThreadOperation(() => this.threadStore.upsertThread({
            id: persistedThreadId,
            agentType: job.agentType,
            title: message.slice(0, 120),
            lastUserMessage: message,
            lastClientId: job.clientId
          }), { event: 'thread_upsert_error', threadId: persistedThreadId });
          threadMetadataPersisted = true;

          this.sseManager.sendToClient(job.clientId, {
            type: 'thread_info',
            jobId: job.jobId,
            threadId: persistedThreadId,
            agentType: job.agentType,
            timestamp: new Date().toISOString()
          });

          await ensureUserEventPersisted();
        }

        if (!actualThreadId) {
          logger.warn({ event: 'missing_thread_id_event', jobId: job.jobId }, 'Skipping event without thread id');
          continue;
        }

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

         if (threadMetadataPersisted) {
           const persistedThreadId = actualThreadId;
           await this.safeThreadOperation(
             () => this.threadStore.appendEvent(persistedThreadId, job.jobId, transformedEvent),
             {
               event: 'thread_event_persist_error',
               threadId: persistedThreadId,
               jobId: job.jobId
             }
           );

           if (
             event.type === 'item.completed' &&
             'item' in event &&
             (event as any).item?.type === 'agent_message' &&
             (event as any).item?.text
           ) {
             await this.safeThreadOperation(
               () => this.threadStore.updateThreadMeta(persistedThreadId, {
                 lastAgentMessage: (event as any).item.text
               }),
               {
                 event: 'thread_meta_update_error',
                 threadId: persistedThreadId
               }
             );
           }
         }

        // Log significant events
        if (event.type === 'turn.completed' || event.type === 'item.completed') {
          logger.info({
            event: 'significant_agent_event',
            jobId: job.jobId,
            eventType: event.type,
            usage: (event as any).usage
          }, `Significant event: ${event.type}`);
        }
      }

      // Mark job as completed
      job.status = 'completed';
      job.endTime = new Date();
      const completionEvent = {
        type: 'job_complete',
        jobId: job.jobId,
        threadId: actualThreadId,
        duration: job.endTime.getTime() - job.startTime.getTime(),
        timestamp: new Date().toISOString()
      };

      // Send completion event
      this.sseManager.sendToClient(job.clientId, completionEvent);

      if (threadMetadataPersisted && actualThreadId) {
        const persistedThreadId = actualThreadId;
        await this.safeThreadOperation(
          () => this.threadStore.appendEvent(persistedThreadId, job.jobId, completionEvent),
          {
            event: 'thread_event_persist_error',
            threadId: persistedThreadId,
            jobId: job.jobId
          }
        );
      }

      logger.info({
        event: 'chat_processing_complete',
        jobId: job.jobId,
        duration: job.endTime.getTime() - job.startTime.getTime()
      }, 'Chat processing completed');

    } catch (error) {
      // Handle errors
      job.status = 'error';
      job.endTime = new Date();
      job.error = error instanceof Error ? error.message : String(error);

      logger.error({
        event: 'chat_processing_error',
        jobId: job.jobId,
        error: job.error
      }, 'Chat processing failed');

      const errorEvent = {
        type: 'error',
        jobId: job.jobId,
        error: job.error,
        timestamp: new Date().toISOString()
      };

      // Send error to client
      this.sseManager.sendToClient(job.clientId, errorEvent);

      if (job.threadId && !this.isTemporaryThreadId(job.threadId)) {
        const persistedThreadId = job.threadId;
        await this.safeThreadOperation(
          () => this.threadStore.appendEvent(persistedThreadId, job.jobId, errorEvent),
          {
            event: 'thread_event_persist_error',
            threadId: persistedThreadId,
            jobId: job.jobId
          }
        );
      }
    }
  }

  private isTemporaryThreadId(id?: string | null): boolean {
    return !!id && id.startsWith('temp_');
  }

  private async persistUserMessageEvent(job: JobInfo, threadId: string, message: string) {
    const timestamp = new Date().toISOString();
    const userEvent = {
      type: 'agent_event',
      jobId: job.jobId,
      agentType: job.agentType,
      threadId,
      event: {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'text', text: message }]
        },
        timestamp
      }
    };

    this.sseManager.sendToClient(job.clientId, userEvent);
    await this.safeThreadOperation(
      () => this.threadStore.appendEvent(threadId, job.jobId, userEvent),
      {
        event: 'thread_user_event_persist_error',
        threadId,
        jobId: job.jobId
      }
    );
  }

  private async safeThreadOperation(operation: () => Promise<void>, meta: Record<string, unknown>) {
    try {
      await operation();
    } catch (error) {
      logger.error({
        ...meta,
        error: error instanceof Error ? error.message : String(error)
      }, 'Thread persistence error');
    }
  }

  private startCleanupInterval() {
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
