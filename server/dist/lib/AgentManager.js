import { Codex } from '@openai/codex-sdk';
import fs from 'fs/promises';
import path from 'path';
import * as toml from 'toml';
import { config } from 'dotenv';
import { logger } from './logger.js';
export class AgentManager {
    agents = new Map();
    threads = new Map(); // threadId -> thread info
    baseAgentPath;
    constructor() {
        this.baseAgentPath = process.env.AGENTS_BASE_PATH || '../agents';
    }
    async initialize() {
        logger.info({ event: 'agent_manager_init' }, 'Initializing AgentManager');
        // Load all agents
        const agentDirs = ['db_agent', 'chit_chat', 'viz_agent', 'doc_agent'];
        for (const agentDir of agentDirs) {
            try {
                await this.loadAgent(agentDir);
                logger.info({ event: 'agent_loaded', agentType: agentDir }, `Agent loaded: ${agentDir}`);
            }
            catch (error) {
                logger.error({
                    event: 'agent_load_error',
                    agentType: agentDir,
                    error: error instanceof Error ? error.message : String(error)
                }, `Failed to load agent: ${agentDir}`);
            }
        }
    }
    async loadAgent(agentType) {
        const agentPath = path.resolve(this.baseAgentPath, agentType);
        // Load .env file
        const envPath = path.join(agentPath, '.env');
        config({ path: envPath });
        // Read .env file manually for API key
        const envContent = await fs.readFile(envPath, 'utf-8');
        const envVars = {};
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                envVars[key.trim()] = value.trim();
            }
        });
        // Load config.toml
        const tomlPath = path.join(agentPath, 'config.toml');
        let tomlConfig = {};
        try {
            const tomlContent = await fs.readFile(tomlPath, 'utf-8');
            tomlConfig = toml.parse(tomlContent);
        }
        catch (error) {
            logger.warn({
                event: 'toml_load_skip',
                agentType,
                error: error instanceof Error ? error.message : String(error)
            }, `No config.toml found for ${agentType}, using defaults`);
        }
        // Build agent configuration
        const agentConfig = {
            name: agentType,
            apiKey: envVars.AZURE_OPENAI_API_KEY || '',
            homePath: envVars.CODEX_HOME || agentPath,
            workingDirectory: envVars.CODEX_HOME || agentPath,
            model: tomlConfig.model,
            modelProvider: tomlConfig.model_provider,
            mcpServers: tomlConfig.mcp_servers,
            threadOpts: {
                workingDirectory: envVars.CODEX_HOME || agentPath,
                sandboxMode: 'danger-full-access',
                skipGitRepoCheck: true
            }
        };
        // Create Codex instance
        const codex = new Codex({
            env: {
                AZURE_OPENAI_API_KEY: agentConfig.apiKey,
                CODEX_HOME: agentConfig.homePath,
                PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
                HOME: process.env.HOME || '',
                USER: process.env.USER || ''
            }
        });
        this.agents.set(agentType, { codex, config: agentConfig });
    }
    getAgent(agentType) {
        const agent = this.agents.get(agentType);
        if (!agent) {
            throw new Error(`Agent not found: ${agentType}`);
        }
        return agent;
    }
    startThread(agentType) {
        const agent = this.getAgent(agentType);
        const thread = agent.codex.startThread(agent.config.threadOpts);
        // Get thread ID (assuming it's accessible - we might need to extract from events)
        const threadId = `${agentType}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        this.threads.set(threadId, {
            thread,
            agentType,
            startTime: new Date(),
            lastActivity: new Date()
        });
        logger.info({
            event: 'thread_started',
            threadId,
            agentType
        }, `Thread started for ${agentType}`);
        return { thread, threadId };
    }
    getThread(threadId) {
        return this.threads.get(threadId);
    }
    updateThreadActivity(threadId) {
        const thread = this.threads.get(threadId);
        if (thread) {
            thread.lastActivity = new Date();
        }
    }
    async resumeThread(agentType, threadId) {
        const agent = this.getAgent(agentType);
        try {
            // Attempt to resume the thread using Codex
            const thread = agent.codex.resumeThread(threadId);
            this.threads.set(threadId, {
                thread,
                agentType,
                startTime: new Date(),
                lastActivity: new Date()
            });
            logger.info({
                event: 'thread_resumed',
                threadId,
                agentType
            }, `Thread resumed for ${agentType}`);
            return thread;
        }
        catch (error) {
            logger.error({
                event: 'thread_resume_error',
                threadId,
                agentType,
                error: error instanceof Error ? error.message : String(error)
            }, `Failed to resume thread`);
            throw error;
        }
    }
    getAvailableAgents() {
        return Array.from(this.agents.keys()).map(agentType => {
            const agent = this.agents.get(agentType);
            return {
                type: agentType,
                name: agent.config.name,
                model: agent.config.model,
                modelProvider: agent.config.modelProvider,
                hasMcpServers: !!agent.config.mcpServers
            };
        });
    }
    getActiveThreads() {
        return Array.from(this.threads.entries()).map(([threadId, thread]) => ({
            threadId,
            agentType: thread.agentType,
            startTime: thread.startTime,
            lastActivity: thread.lastActivity
        }));
    }
    cleanupInactiveThreads(maxIdleMs = 30 * 60 * 1000) {
        const now = Date.now();
        const toRemove = [];
        this.threads.forEach((thread, threadId) => {
            if (now - thread.lastActivity.getTime() > maxIdleMs) {
                toRemove.push(threadId);
            }
        });
        toRemove.forEach(threadId => {
            this.threads.delete(threadId);
            logger.info({
                event: 'thread_cleanup',
                threadId
            }, `Thread cleaned up due to inactivity`);
        });
        return toRemove.length;
    }
}
//# sourceMappingURL=AgentManager.js.map