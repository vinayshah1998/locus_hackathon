/**
 * Payment Negotiation Executor
 * Handles incoming payment requests and makes decisions based on personality and credit
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Message,
  TaskStatus,
  PaymentRequest,
  PaymentResponse,
  DataPart
} from './a2a-types.js';
import { TaskStore } from './task-store.js';
import { AgentExecutor } from './a2a-server.js';
import { PersonalityConfig, evaluatePaymentDecision } from './personality.js';
import { getCreditScore } from '../tools.js';

export interface ExecutorConfig {
  personality: PersonalityConfig;
  walletAddress: string;
  agentName: string;
}

export class PaymentNegotiationExecutor implements AgentExecutor {
  private config: ExecutorConfig;

  constructor(config: ExecutorConfig) {
    this.config = config;
  }

  async execute(
    taskId: string,
    contextId: string,
    message: Message,
    taskStore: TaskStore
  ): Promise<TaskStatus> {
    console.log(`\n[Executor] Processing message for task ${taskId}`);

    // Parse the incoming message
    const content = this.extractMessageContent(message);

    if (!content) {
      return this.createFailedStatus('Unable to parse message content');
    }

    // Check if this is a user decision (response to input-required)
    if (content.type === 'user_decision') {
      return await this.handleUserDecision(taskId, contextId, content as { decision: string; message?: string }, taskStore);
    }

    // Check if this is a payment request
    if (content.type === 'payment_request') {
      return await this.handlePaymentRequest(taskId, contextId, content as unknown as PaymentRequest, taskStore);
    }

    // Check if this is a payment response
    if (content.type === 'payment_response') {
      return await this.handlePaymentResponse(taskId, contextId, content as unknown as PaymentResponse, taskStore);
    }

    // Unknown message type
    return this.createFailedStatus(`Unknown message type: ${content.type}`);
  }

  private async handlePaymentRequest(
    taskId: string,
    contextId: string,
    request: PaymentRequest,
    taskStore: TaskStore
  ): Promise<TaskStatus> {
    console.log(`[Executor] Handling payment request from ${request.from_agent}`);
    console.log(`  Amount: $${request.amount} ${request.currency}`);
    console.log(`  Proposed delay: ${request.proposed_delay_days || 0} days`);

    // Store the request in task metadata
    taskStore.setMetadata(taskId, 'paymentRequest', request);

    // If no delay requested, auto-accept
    if (!request.proposed_delay_days || request.proposed_delay_days === 0) {
      console.log('[Executor] No delay requested, auto-accepting');
      return this.createAcceptedResponse(taskId, contextId, request, taskStore);
    }

    // Check credit score of the requester
    let creditScore = 70; // Default
    let isNewAgent = false;

    try {
      console.log(`[Executor] Checking credit score for ${request.from_agent}...`);
      const creditResult = await getCreditScore(request.from_agent);
      creditScore = creditResult.credit_score;
      isNewAgent = creditResult.is_new_agent;
      console.log(`[Executor] Credit score: ${creditScore} (new agent: ${isNewAgent})`);
    } catch (error) {
      console.warn('[Executor] Failed to get credit score, using default:', error);
    }

    taskStore.setMetadata(taskId, 'creditScore', creditScore);
    taskStore.setMetadata(taskId, 'isNewAgent', isNewAgent);

    // Evaluate based on personality
    const evaluation = evaluatePaymentDecision(
      this.config.personality,
      creditScore,
      request.proposed_delay_days,
      request.amount
    );

    console.log(`[Executor] Decision evaluation:`, evaluation);

    // If user approval required, transition to input-required
    if (evaluation.requiresUserApproval) {
      return this.createInputRequiredStatus(
        taskId,
        contextId,
        request,
        creditScore,
        isNewAgent,
        evaluation
      );
    }

    // Auto-decide based on evaluation
    if (evaluation.recommendation === 'accept') {
      return this.createAcceptedResponse(taskId, contextId, request, taskStore);
    } else if (evaluation.recommendation === 'counter_offer' && evaluation.counterOffer) {
      return this.createCounterOfferResponse(
        taskId,
        contextId,
        request,
        evaluation.counterOffer.delayDays,
        taskStore
      );
    } else {
      return this.createRejectedResponse(taskId, contextId, request, evaluation.reason, taskStore);
    }
  }

  private async handleUserDecision(
    taskId: string,
    contextId: string,
    decision: { decision: string; message?: string },
    taskStore: TaskStore
  ): Promise<TaskStatus> {
    console.log(`[Executor] Processing user decision: ${decision.decision}`);

    const request = taskStore.getMetadata(taskId, 'paymentRequest') as PaymentRequest;
    if (!request) {
      return this.createFailedStatus('No payment request found for this task');
    }

    switch (decision.decision) {
      case 'approve':
      case 'accept':
        return this.createAcceptedResponse(taskId, contextId, request, taskStore);

      case 'reject':
        return this.createRejectedResponse(
          taskId,
          contextId,
          request,
          decision.message || 'User rejected the payment request',
          taskStore
        );

      case 'counter':
        // Extract counter offer details from message if provided
        const counterDays = this.extractCounterOfferDays(decision.message);
        return this.createCounterOfferResponse(
          taskId,
          contextId,
          request,
          counterDays,
          taskStore
        );

      default:
        return this.createFailedStatus(`Unknown user decision: ${decision.decision}`);
    }
  }

  private async handlePaymentResponse(
    taskId: string,
    contextId: string,
    response: PaymentResponse,
    taskStore: TaskStore
  ): Promise<TaskStatus> {
    console.log(`[Executor] Received payment response: ${response.decision}`);

    // Store the response
    taskStore.setMetadata(taskId, 'paymentResponse', response);

    // Create completion status with the response
    const responseMessage: Message = {
      kind: 'message',
      messageId: uuidv4(),
      role: 'agent',
      taskId,
      contextId,
      parts: [
        {
          kind: 'text',
          text: `Payment negotiation ${response.decision}. ${response.reason || ''}`
        },
        {
          kind: 'data',
          data: response as unknown as Record<string, unknown>
        }
      ],
      timestamp: new Date().toISOString()
    };

    return {
      state: 'completed',
      message: responseMessage,
      timestamp: new Date().toISOString()
    };
  }

  private createInputRequiredStatus(
    taskId: string,
    contextId: string,
    request: PaymentRequest,
    creditScore: number,
    isNewAgent: boolean,
    evaluation: ReturnType<typeof evaluatePaymentDecision>
  ): TaskStatus {
    const promptText = [
      `Payment Request Received`,
      ``,
      `From: ${request.from_agent}`,
      `Amount: $${request.amount} ${request.currency}`,
      `Requested delay: ${request.proposed_delay_days} days`,
      ``,
      `Credit Assessment:`,
      `- Credit Score: ${creditScore}/100 ${isNewAgent ? '(New Agent)' : ''}`,
      `- Recommendation: ${evaluation.recommendation.toUpperCase()}`,
      `- Reason: ${evaluation.reason}`,
      ``,
      `What would you like to do?`,
      `- approve: Accept the delayed payment`,
      `- reject: Reject and demand immediate payment`,
      `- counter: Make a counter-offer`
    ].join('\n');

    const message: Message = {
      kind: 'message',
      messageId: uuidv4(),
      role: 'agent',
      taskId,
      contextId,
      parts: [
        { kind: 'text', text: promptText },
        {
          kind: 'data',
          data: {
            type: 'input_request',
            request,
            creditScore,
            isNewAgent,
            evaluation
          }
        }
      ],
      timestamp: new Date().toISOString()
    };

    return {
      state: 'input-required',
      message,
      timestamp: new Date().toISOString()
    };
  }

  private createAcceptedResponse(
    taskId: string,
    contextId: string,
    request: PaymentRequest,
    taskStore: TaskStore
  ): TaskStatus {
    const response: PaymentResponse = {
      type: 'payment_response',
      request_id: taskId,
      decision: 'accepted',
      reason: `Payment of $${request.amount} with ${request.proposed_delay_days || 0} days delay accepted`
    };

    taskStore.setMetadata(taskId, 'response', response);

    const message: Message = {
      kind: 'message',
      messageId: uuidv4(),
      role: 'agent',
      taskId,
      contextId,
      parts: [
        {
          kind: 'text',
          text: `Accepted payment request for $${request.amount} ${request.currency}`
        },
        { kind: 'data', data: response as unknown as Record<string, unknown> }
      ],
      timestamp: new Date().toISOString()
    };

    return {
      state: 'completed',
      message,
      timestamp: new Date().toISOString()
    };
  }

  private createRejectedResponse(
    taskId: string,
    contextId: string,
    _request: PaymentRequest,
    reason: string,
    taskStore: TaskStore
  ): TaskStatus {
    const response: PaymentResponse = {
      type: 'payment_response',
      request_id: taskId,
      decision: 'rejected',
      reason
    };

    taskStore.setMetadata(taskId, 'response', response);

    const message: Message = {
      kind: 'message',
      messageId: uuidv4(),
      role: 'agent',
      taskId,
      contextId,
      parts: [
        { kind: 'text', text: `Rejected: ${reason}` },
        { kind: 'data', data: response as unknown as Record<string, unknown> }
      ],
      timestamp: new Date().toISOString()
    };

    return {
      state: 'completed',
      message,
      timestamp: new Date().toISOString()
    };
  }

  private createCounterOfferResponse(
    taskId: string,
    contextId: string,
    request: PaymentRequest,
    counterDelayDays: number,
    taskStore: TaskStore
  ): TaskStatus {
    const response: PaymentResponse = {
      type: 'payment_response',
      request_id: taskId,
      decision: 'counter_offer',
      reason: `Counter-offer: Can accept ${counterDelayDays} days delay instead of ${request.proposed_delay_days}`,
      counter_offer: {
        delay_days: counterDelayDays
      }
    };

    taskStore.setMetadata(taskId, 'response', response);

    const message: Message = {
      kind: 'message',
      messageId: uuidv4(),
      role: 'agent',
      taskId,
      contextId,
      parts: [
        {
          kind: 'text',
          text: `Counter-offer: ${counterDelayDays} days delay (originally requested: ${request.proposed_delay_days} days)`
        },
        { kind: 'data', data: response as unknown as Record<string, unknown> }
      ],
      timestamp: new Date().toISOString()
    };

    return {
      state: 'completed',
      message,
      timestamp: new Date().toISOString()
    };
  }

  private createFailedStatus(reason: string): TaskStatus {
    return {
      state: 'failed',
      message: {
        kind: 'message',
        messageId: uuidv4(),
        role: 'agent',
        parts: [{ kind: 'text', text: `Error: ${reason}` }],
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };
  }

  private extractMessageContent(message: Message): Record<string, unknown> | null {
    for (const part of message.parts) {
      if (part.kind === 'data') {
        return (part as DataPart).data;
      }
    }

    // Try to parse text as JSON
    for (const part of message.parts) {
      if (part.kind === 'text') {
        try {
          return JSON.parse(part.text);
        } catch {
          // Not JSON, continue
        }
      }
    }

    return null;
  }

  private extractCounterOfferDays(message?: string): number {
    if (!message) {
      return this.config.personality.maxAcceptableDelayDays;
    }

    // Try to extract number from message
    const match = message.match(/(\d+)\s*days?/i);
    if (match) {
      return parseInt(match[1], 10);
    }

    return this.config.personality.maxAcceptableDelayDays;
  }
}
