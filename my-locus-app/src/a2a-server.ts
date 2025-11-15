/**
 * A2A Protocol Express Server
 * Handles incoming agent-to-agent communication
 */

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentCard,
  JsonRpcRequest,
  JsonRpcResponse,
  Message,
  SendMessageParams,
  SendMessageResult,
  GetTaskParams,
  CancelTaskParams,
  TaskStatus
} from './a2a-types.js';
import { TaskStore } from './task-store.js';

export interface AgentExecutor {
  execute(
    taskId: string,
    contextId: string,
    message: Message,
    taskStore: TaskStore
  ): Promise<TaskStatus>;
}

// Event emitter for task completion notifications
type TaskCompletionCallback = (taskId: string, status: TaskStatus) => void;
const taskCompletionCallbacks: Map<string, TaskCompletionCallback> = new Map();

export interface A2AServerConfig {
  agentCard: AgentCard;
  taskStore: TaskStore;
  executor: AgentExecutor;
  apiKey?: string;
}

export class A2AServer {
  private app: Express;
  private config: A2AServerConfig;
  private sseClients: Map<string, Response> = new Map();

  constructor(config: A2AServerConfig) {
    this.config = config;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());

    // API key authentication (if configured)
    if (this.config.apiKey) {
      this.app.use((req, res, next) => {
        // Skip auth for agent card discovery
        if (req.path === '/.well-known/agent-card.json') {
          return next();
        }

        const providedKey = req.headers['x-agent-api-key'];
        if (providedKey !== this.config.apiKey) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
      });
    }
  }

  private setupRoutes(): void {
    // Agent Card discovery endpoint
    this.app.get('/.well-known/agent-card.json', (req, res) => {
      res.json(this.config.agentCard);
    });

    // JSON-RPC endpoint
    this.app.post('/', async (req, res) => {
      const rpcRequest = req.body as JsonRpcRequest;

      if (rpcRequest.jsonrpc !== '2.0') {
        return res.json(this.createErrorResponse(rpcRequest.id, -32600, 'Invalid Request'));
      }

      try {
        const result = await this.handleRpcMethod(rpcRequest);
        res.json(this.createSuccessResponse(rpcRequest.id, result));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.json(this.createErrorResponse(rpcRequest.id, -32000, errorMessage));
      }
    });

    // SSE streaming endpoint for task updates
    this.app.get('/stream/:taskId', (req, res) => {
      const taskId = req.params.taskId;

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });

      // Register SSE client
      this.sseClients.set(taskId, res);

      // Send initial connection event
      res.write(`data: ${JSON.stringify({ type: 'connected', taskId })}\n\n`);

      // Clean up on disconnect
      req.on('close', () => {
        this.sseClients.delete(taskId);
      });
    });

    // Get pending input-required tasks (for UI)
    this.app.get('/tasks/pending-input', (req, res) => {
      const tasks = this.config.taskStore.getTasksRequiringInput();
      res.json({ tasks });
    });

    // Get specific task
    this.app.get('/tasks/:taskId', (req, res) => {
      const task = this.config.taskStore.getTask(req.params.taskId);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json({ task });
    });

    // User provides input for a task (used by UI)
    this.app.post('/tasks/:taskId/input', async (req, res) => {
      const taskId = req.params.taskId;
      const { decision, message: userMessage } = req.body;

      const task = this.config.taskStore.getTask(taskId);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      if (task.status.state !== 'input-required') {
        return res.status(400).json({ error: 'Task is not waiting for input' });
      }

      // Create user response message
      const responseMessage: Message = {
        kind: 'message',
        messageId: uuidv4(),
        role: 'user',
        taskId,
        contextId: task.contextId,
        parts: [
          {
            kind: 'data',
            data: {
              type: 'user_decision',
              decision,
              message: userMessage
            }
          }
        ],
        timestamp: new Date().toISOString()
      };

      // Add to history
      this.config.taskStore.addMessageToHistory(taskId, responseMessage);

      // Resume execution
      const newStatus = await this.config.executor.execute(
        taskId,
        task.contextId,
        responseMessage,
        this.config.taskStore
      );

      this.config.taskStore.updateTaskStatus(taskId, newStatus);

      // Notify SSE clients
      this.notifySSE(taskId, newStatus);

      // Notify any waiting HTTP requests (for blocking mode)
      const callback = taskCompletionCallbacks.get(taskId);
      if (callback) {
        callback(taskId, newStatus);
        taskCompletionCallbacks.delete(taskId);
      }

      res.json({ taskId, status: newStatus });
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        agentName: this.config.agentCard.name,
        timestamp: new Date().toISOString()
      });
    });
  }

  private async handleRpcMethod(request: JsonRpcRequest): Promise<unknown> {
    switch (request.method) {
      case 'message/send':
        return await this.handleMessageSend(request.params as unknown as SendMessageParams);

      case 'tasks/get':
        return this.handleGetTask(request.params as unknown as GetTaskParams);

      case 'tasks/cancel':
        return this.handleCancelTask(request.params as unknown as CancelTaskParams);

      default:
        throw new Error(`Method not found: ${request.method}`);
    }
  }

  private async handleMessageSend(params: SendMessageParams): Promise<SendMessageResult> {
    const { message, configuration } = params;
    const blocking = configuration?.blocking !== false; // Default to blocking

    // Get or create context
    let contextId = message.contextId || uuidv4();
    let taskId = message.taskId;

    // Check if this is a continuation of an existing task
    let task = taskId
      ? this.config.taskStore.getTask(taskId)
      : this.config.taskStore.getTaskByContextId(contextId);

    if (!task) {
      // New task
      taskId = uuidv4();
      task = this.config.taskStore.createTask(taskId, contextId, message);
    } else {
      taskId = task.id;
      contextId = task.contextId;
      this.config.taskStore.addMessageToHistory(taskId, message);
    }

    // Update status to working
    const workingStatus: TaskStatus = {
      state: 'working',
      timestamp: new Date().toISOString()
    };
    this.config.taskStore.updateTaskStatus(taskId, workingStatus);

    // Execute agent logic
    let finalStatus = await this.config.executor.execute(
      taskId,
      contextId,
      message,
      this.config.taskStore
    );

    this.config.taskStore.updateTaskStatus(taskId, finalStatus);

    // If input-required and blocking mode, wait for user decision
    if (finalStatus.state === 'input-required' && blocking) {
      console.log(`[A2AServer] Task ${taskId} requires input, waiting for user decision...`);

      // Wait for user to provide input (with timeout)
      const TIMEOUT_MS = 300000; // 5 minutes
      finalStatus = await new Promise<TaskStatus>((resolve) => {
        const timeout = setTimeout(() => {
          taskCompletionCallbacks.delete(taskId);
          const timeoutStatus: TaskStatus = {
            state: 'failed',
            message: {
              kind: 'message',
              messageId: uuidv4(),
              role: 'agent',
              parts: [{ kind: 'text', text: 'Request timed out waiting for user decision' }],
              timestamp: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
          };
          this.config.taskStore.updateTaskStatus(taskId, timeoutStatus);
          resolve(timeoutStatus);
        }, TIMEOUT_MS);

        taskCompletionCallbacks.set(taskId, (_id, status) => {
          clearTimeout(timeout);
          resolve(status);
        });
      });
    }

    // Notify any SSE clients
    this.notifySSE(taskId, finalStatus);

    return {
      taskId,
      contextId,
      status: finalStatus,
      artifacts: task.artifacts
    };
  }

  private handleGetTask(params: GetTaskParams): { task: unknown } {
    const task = this.config.taskStore.getTask(params.taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    // Apply history length limit if specified
    if (params.historyLength && task.history) {
      task.history = task.history.slice(-params.historyLength);
    }

    return { task };
  }

  private handleCancelTask(params: CancelTaskParams): { success: boolean } {
    const task = this.config.taskStore.getTask(params.taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const cancelStatus: TaskStatus = {
      state: 'cancelled',
      timestamp: new Date().toISOString()
    };

    this.config.taskStore.updateTaskStatus(params.taskId, cancelStatus);
    this.notifySSE(params.taskId, cancelStatus);

    return { success: true };
  }

  private createSuccessResponse(id: string | number, result: unknown): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      result
    };
  }

  private createErrorResponse(
    id: string | number,
    code: number,
    message: string
  ): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message }
    };
  }

  private notifySSE(taskId: string, status: TaskStatus): void {
    const client = this.sseClients.get(taskId);
    if (client) {
      const event = {
        kind: 'status-update',
        taskId,
        status,
        final: ['completed', 'cancelled', 'rejected', 'failed'].includes(status.state)
      };
      client.write(`data: ${JSON.stringify(event)}\n\n`);

      if (event.final) {
        this.sseClients.delete(taskId);
      }
    }
  }

  getExpressApp(): Express {
    return this.app;
  }

  getTaskStore(): TaskStore {
    return this.config.taskStore;
  }
}
