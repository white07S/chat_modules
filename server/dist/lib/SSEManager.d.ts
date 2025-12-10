import { Response } from 'express';
export interface SSEClient {
    id: string;
    response: Response;
    agentType?: string;
    connectedAt: Date;
}
export declare class SSEManager {
    private clients;
    addClient(clientId: string, res: Response, agentType?: string): void;
    removeClient(clientId: string): void;
    sendToClient(clientId: string, data: any): boolean;
    broadcast(data: any): void;
    getConnectedClients(): Array<{
        id: string;
        agentType?: string;
        connectedAt: Date;
    }>;
    isClientConnected(clientId: string): boolean;
}
//# sourceMappingURL=SSEManager.d.ts.map