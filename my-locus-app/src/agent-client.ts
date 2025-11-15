/**
 * A2A Client
 * Sends requests to other agents and handles responses
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AgentCard,
  JsonRpcRequest,
  JsonRpcResponse,
  Message,
  SendMessageResult,
  PaymentRequest
} from './a2a-types.js';

export interface A2AClientConfig {
  fromWallet: string;
  apiKey?: string;
}

export class A2AClient {
  private agentCard: AgentCard | null = null;
  private agentUrl: string;
  private config: A2AClientConfig;

  constructor(agentUrl: string, config: A2AClientConfig) {
    this.agentUrl = agentUrl.replace(/\/$/, ''); // Remove trailing slash
    this.config = config;
  }

  static async fromCardUrl(cardUrl: string, config: A2AClientConfig): Promise<A2AClient> {
    const client = new A2AClient(cardUrl.replace('/.well-known/agent-card.json', ''), config);
    await client.fetchAgentCard();
    return client;
  }

  async fetchAgentCard(): Promise<AgentCard> {
    const cardUrl = `${this.agentUrl}/.well-known/agent-card.json`;
    console.log(`[A2AClient] Fetching agent card from ${cardUrl}`);

    const response = await fetch(cardUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch agent card: ${response.statusText}`);
    }

    this.agentCard = (await response.json()) as AgentCard;
    console.log(`[A2AClient] Connected to agent: ${this.agentCard!.name}`);
    return this.agentCard!;
  }

  getAgentCard(): AgentCard | null {
    return this.agentCard;
  }

  async sendMessage(message: Message): Promise<SendMessageResult> {
    const rpcRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'message/send',
      params: { message }
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['X-Agent-API-Key'] = this.config.apiKey;
    }

    console.log(`[A2AClient] Sending message to ${this.agentUrl}`);

    const response = await fetch(this.agentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(rpcRequest)
    });

    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.statusText}`);
    }

    const rpcResponse = (await response.json()) as JsonRpcResponse;

    if (rpcResponse.error) {
      throw new Error(`RPC error: ${rpcResponse.error.message}`);
    }

    return rpcResponse.result as SendMessageResult;
  }

  async sendPaymentRequest(
    toAgent: string,
    amount: number,
    currency: string,
    dueDate: string,
    proposedDelayDays?: number,
    reason?: string
  ): Promise<SendMessageResult> {
    const paymentRequest: PaymentRequest = {
      type: 'payment_request',
      from_agent: this.config.fromWallet,
      to_agent: toAgent,
      amount,
      currency,
      due_date: dueDate,
      proposed_delay_days: proposedDelayDays,
      reason
    };

    const message: Message = {
      kind: 'message',
      messageId: uuidv4(),
      role: 'user',
      parts: [
        {
          kind: 'text',
          text: `Payment request: $${amount} ${currency}, delay: ${proposedDelayDays || 0} days`
        },
        {
          kind: 'data',
          data: paymentRequest as unknown as Record<string, unknown>
        }
      ],
      timestamp: new Date().toISOString()
    };

    console.log(`[A2AClient] Sending payment request:`);
    console.log(`  To: ${toAgent}`);
    console.log(`  Amount: $${amount} ${currency}`);
    console.log(`  Proposed delay: ${proposedDelayDays || 0} days`);

    const result = await this.sendMessage(message);

    console.log(`[A2AClient] Response received:`);
    console.log(`  Task ID: ${result.taskId}`);
    console.log(`  Status: ${result.status.state}`);

    return result;
  }

  async getTask(taskId: string): Promise<unknown> {
    const rpcRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'tasks/get',
      params: { taskId }
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['X-Agent-API-Key'] = this.config.apiKey;
    }

    const response = await fetch(this.agentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(rpcRequest)
    });

    const rpcResponse = (await response.json()) as JsonRpcResponse;

    if (rpcResponse.error) {
      throw new Error(`RPC error: ${rpcResponse.error.message}`);
    }

    return rpcResponse.result;
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const rpcRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'tasks/cancel',
      params: { taskId }
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['X-Agent-API-Key'] = this.config.apiKey;
    }

    const response = await fetch(this.agentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(rpcRequest)
    });

    const rpcResponse = (await response.json()) as JsonRpcResponse;

    if (rpcResponse.error) {
      throw new Error(`RPC error: ${rpcResponse.error.message}`);
    }

    const result = rpcResponse.result as { success: boolean };
    return result.success;
  }

  // Subscribe to task updates via SSE
  subscribeToTask(
    taskId: string,
    onUpdate: (event: unknown) => void,
    onError?: (error: Error) => void
  ): () => void {
    const eventSource = new EventSource(`${this.agentUrl}/stream/${taskId}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onUpdate(data);

        // Close if final
        if (data.final) {
          eventSource.close();
        }
      } catch (error) {
        if (onError) {
          onError(error as Error);
        }
      }
    };

    eventSource.onerror = () => {
      if (onError) {
        onError(new Error('SSE connection error'));
      }
      eventSource.close();
    };

    // Return cleanup function
    return () => {
      eventSource.close();
    };
  }
}

// Helper to create a discovery service for multiple agents
export class AgentRegistry {
  private agents: Map<string, A2AClient> = new Map();
  private walletToUrl: Map<string, string> = new Map();

  registerAgent(walletAddress: string, agentUrl: string): void {
    this.walletToUrl.set(walletAddress, agentUrl);
  }

  async getClient(
    walletAddress: string,
    fromWallet: string,
    apiKey?: string
  ): Promise<A2AClient | null> {
    // Check cache
    if (this.agents.has(walletAddress)) {
      return this.agents.get(walletAddress)!;
    }

    // Look up URL
    const agentUrl = this.walletToUrl.get(walletAddress);
    if (!agentUrl) {
      console.warn(`[AgentRegistry] No agent URL registered for wallet ${walletAddress}`);
      return null;
    }

    // Create client
    try {
      const client = await A2AClient.fromCardUrl(`${agentUrl}/.well-known/agent-card.json`, {
        fromWallet,
        apiKey
      });
      this.agents.set(walletAddress, client);
      return client;
    } catch (error) {
      console.error(`[AgentRegistry] Failed to connect to agent at ${agentUrl}:`, error);
      return null;
    }
  }

  listRegisteredAgents(): string[] {
    return Array.from(this.walletToUrl.keys());
  }
}
