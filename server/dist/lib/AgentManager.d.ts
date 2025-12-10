import { Codex, Thread } from '@openai/codex-sdk';
export interface AgentConfig {
    name: string;
    apiKey: string;
    homePath: string;
    workingDirectory: string;
    model?: string;
    modelProvider?: string;
    mcpServers?: any;
    threadOpts: any;
}
export interface ActiveThread {
    thread: Thread;
    agentType: string;
    startTime: Date;
    lastActivity: Date;
}
export declare class AgentManager {
    private agents;
    private threads;
    private baseAgentPath;
    constructor();
    initialize(): Promise<void>;
    private loadAgent;
    getAgent(agentType: string): {
        codex: Codex;
        config: AgentConfig;
    };
    startThread(agentType: string): {
        thread: Thread;
        threadId: string;
    };
    getThread(threadId: string): ActiveThread | undefined;
    updateThreadActivity(threadId: string): void;
    resumeThread(agentType: string, threadId: string): Promise<Thread>;
    getAvailableAgents(): {
        type: string;
        name: string;
        model: string | undefined;
        modelProvider: string | undefined;
        hasMcpServers: boolean;
    }[];
    getActiveThreads(): {
        threadId: string;
        agentType: string;
        startTime: Date;
        lastActivity: Date;
    }[];
    cleanupInactiveThreads(maxIdleMs?: number): number;
}
//# sourceMappingURL=AgentManager.d.ts.map