import { Response } from 'express';
import { logger } from './logger.js';

export interface SSEClient {
  id: string;
  response: Response;
  agentType?: string;
  connectedAt: Date;
}

export class SSEManager {
  private clients: Map<string, SSEClient> = new Map();

  addClient(clientId: string, res: Response, agentType?: string): void {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no' // Disable Nginx buffering
    });

    // Store client
    this.clients.set(clientId, {
      id: clientId,
      response: res,
      agentType,
      connectedAt: new Date()
    });

    // Send initial connection event
    this.sendToClient(clientId, {
      type: 'connected',
      clientId,
      timestamp: new Date().toISOString()
    });

    // Handle client disconnect
    res.on('close', () => {
      this.removeClient(clientId);
    });

    logger.info({
      event: 'sse_client_connected',
      clientId,
      agentType
    }, `SSE client connected`);
  }

  removeClient(clientId: string): void {
    if (this.clients.has(clientId)) {
      this.clients.delete(clientId);
      logger.info({
        event: 'sse_client_disconnected',
        clientId
      }, `SSE client disconnected`);
    }
  }

  sendToClient(clientId: string, data: any): boolean {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        // Format as SSE
        const message = `data: ${JSON.stringify(data)}\n\n`;
        client.response.write(message);

        logger.debug({
          event: 'sse_message_sent',
          clientId,
          messageType: data.type
        }, `SSE message sent to client`);

        return true;
      } catch (error) {
        logger.error({
          event: 'sse_send_error',
          clientId,
          error: error instanceof Error ? error.message : String(error)
        }, `Failed to send SSE message`);
        this.removeClient(clientId);
        return false;
      }
    }
    return false;
  }

  broadcast(data: any): void {
    this.clients.forEach((client, clientId) => {
      this.sendToClient(clientId, data);
    });
  }

  getConnectedClients(): Array<{id: string; agentType?: string; connectedAt: Date}> {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      agentType: client.agentType,
      connectedAt: client.connectedAt
    }));
  }

  isClientConnected(clientId: string): boolean {
    return this.clients.has(clientId);
  }
}