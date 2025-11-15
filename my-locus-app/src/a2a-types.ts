/**
 * A2A Protocol Types
 * Based on Agent2Agent Protocol Specification v0.3.0
 * https://github.com/a2aproject/a2a-js
 */

// JSON-RPC 2.0 types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Agent Card (discovery)
export interface AgentCard {
  name: string;
  description: string;
  protocolVersion: string;
  version: string;
  url: string;
  preferredTransport: 'JSONRPC' | 'SSE';
  skills: AgentSkill[];
  capabilities: AgentCapabilities;
  securitySchemes?: Record<string, SecurityScheme>;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface AgentCapabilities {
  streaming: boolean;
  pushNotifications: boolean;
  stateTransitionHistory: boolean;
}

export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2';
  in?: 'header' | 'query' | 'cookie';
  name?: string;
  scheme?: string;
}

// Task States
export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'failed';

// Message Parts
export interface TextPart {
  kind: 'text';
  text: string;
}

export interface DataPart {
  kind: 'data';
  data: Record<string, unknown>;
}

export interface FilePart {
  kind: 'file';
  file: {
    uri: string;
    mimeType: string;
    name?: string;
  };
}

export type Part = TextPart | DataPart | FilePart;

// Messages
export interface Message {
  kind: 'message';
  messageId: string;
  role: 'user' | 'agent';
  parts: Part[];
  contextId?: string;
  taskId?: string;
  timestamp?: string;
}

// Task
export interface Task {
  id: string;
  contextId: string;
  status: TaskStatus;
  history?: Message[];
  artifacts?: Artifact[];
  metadata?: Record<string, unknown>;
}

export interface TaskStatus {
  state: TaskState;
  message?: Message;
  timestamp: string;
}

export interface Artifact {
  artifactId: string;
  name: string;
  parts: Part[];
}

// Events (for streaming)
export interface TaskStatusUpdateEvent {
  kind: 'status-update';
  taskId: string;
  contextId: string;
  status: TaskStatus;
  final: boolean;
}

export interface TaskArtifactUpdateEvent {
  kind: 'artifact-update';
  taskId: string;
  contextId: string;
  artifact: Artifact;
}

export type TaskEvent = TaskStatusUpdateEvent | TaskArtifactUpdateEvent;

// A2A Methods
export interface SendMessageParams {
  message: Message;
  configuration?: {
    acceptedOutputModes?: string[];
    blocking?: boolean;
    historyLength?: number;
  };
}

export interface SendMessageResult {
  taskId: string;
  contextId: string;
  status: TaskStatus;
  artifacts?: Artifact[];
}

export interface GetTaskParams {
  taskId: string;
  historyLength?: number;
}

export interface CancelTaskParams {
  taskId: string;
}

// Payment Negotiation specific data structures
export interface PaymentRequest {
  type: 'payment_request';
  from_agent: string;
  to_agent: string;
  amount: number;
  currency: string;
  due_date: string;
  proposed_delay_days?: number;
  reason?: string;
}

export interface PaymentResponse {
  type: 'payment_response';
  request_id: string;
  decision: 'accepted' | 'rejected' | 'counter_offer';
  reason?: string;
  counter_offer?: {
    delay_days?: number;
    partial_amount?: number;
  };
}

export interface PaymentNegotiationState {
  requestId: string;
  paymentRequest: PaymentRequest;
  status: 'pending' | 'accepted' | 'rejected' | 'counter_offered';
  creditScore?: number;
  userApprovalRequired: boolean;
  userDecision?: 'approve' | 'reject' | 'counter';
  negotiationHistory: Array<PaymentRequest | PaymentResponse>;
}
