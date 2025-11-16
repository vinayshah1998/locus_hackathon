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
import { PersonalityConfig } from './personality.js';
import { AINegotiator, AIDecision } from './ai-negotiator.js';
import { LocusPaymentService } from './locus-payment-service.js';
import { reportPayment } from '../tools.js';

export interface ExecutorConfig {
  personality: PersonalityConfig;
  walletAddress: string;
  agentName: string;
  locusPaymentService?: LocusPaymentService;
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
      return await this.createAcceptedResponse(taskId, contextId, request, taskStore);
    }

    // Use AI Negotiator for intelligent decision-making
    console.log('[Executor] Invoking Claude AI for negotiation decision...');
    const aiNegotiator = new AINegotiator(this.config.locusPaymentService);
    const aiDecision = await aiNegotiator.evaluatePaymentRequest({
      paymentRequest: request,
      personality: this.config.personality,
      agentWallet: this.config.walletAddress,
      agentName: this.config.agentName
    });

    // Store AI decision for transparency
    taskStore.setMetadata(taskId, 'aiDecision', aiDecision);

    console.log(`[Executor] AI Decision: ${aiDecision.decision} (confidence: ${aiDecision.confidence})`);
    console.log(`[Executor] AI Reason: ${aiDecision.reason.substring(0, 200)}...`);

    // Check if we need user approval based on autonomy level
    if (this.shouldAskUser(aiDecision)) {
      console.log('[Executor] User approval required based on autonomy level');
      return this.createInputRequiredStatusFromAI(
        taskId,
        contextId,
        request,
        aiDecision
      );
    }

    // Execute the AI's decision autonomously
    switch (aiDecision.decision) {
      case 'accept':
        return await this.createAcceptedResponse(taskId, contextId, request, taskStore);

      case 'counter_offer':
        const counterDays = aiDecision.counterOfferDays || this.config.personality.maxAcceptableDelayDays;
        return this.createCounterOfferResponse(taskId, contextId, request, counterDays, taskStore);

      case 'reject':
        return this.createRejectedResponse(taskId, contextId, request, aiDecision.reason, taskStore);

      case 'ask_user':
      default:
        return this.createInputRequiredStatusFromAI(taskId, contextId, request, aiDecision);
    }
  }

  private shouldAskUser(aiDecision: AIDecision): boolean {
    const autonomy = this.config.personality.autonomyLevel;

    // Full autonomy - AI decides everything
    if (autonomy === 'full') {
      return aiDecision.decision === 'ask_user';
    }

    // Conservative autonomy - always ask user
    if (autonomy === 'conservative') {
      return true;
    }

    // Semi autonomy - ask user for low confidence or explicit ask_user
    if (autonomy === 'semi') {
      if (aiDecision.decision === 'ask_user') return true;
      if (aiDecision.confidence === 'low') return true;
      return false;
    }

    return false;
  }

  private createInputRequiredStatusFromAI(
    taskId: string,
    contextId: string,
    request: PaymentRequest,
    aiDecision: AIDecision
  ): TaskStatus {
    const promptText = [
      `Payment Request Received`,
      ``,
      `From: ${request.from_agent}`,
      `Amount: $${request.amount} ${request.currency}`,
      `Requested delay: ${request.proposed_delay_days} days`,
      ``,
      `AI Analysis:`,
      `- Recommendation: ${aiDecision.decision.toUpperCase()}`,
      `- Confidence: ${aiDecision.confidence.toUpperCase()}`,
      `- Reasoning: ${aiDecision.reason}`,
      `- Tools Used: ${aiDecision.toolsUsed.join(', ') || 'None'}`,
      aiDecision.counterOfferDays ? `- Suggested Counter-Offer: ${aiDecision.counterOfferDays} days` : '',
      ``,
      `What would you like to do?`,
      `- approve: Accept the delayed payment`,
      `- reject: Reject and demand immediate payment`,
      `- counter: Make a counter-offer`
    ].filter(Boolean).join('\n');

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
            aiDecision
          } as unknown as Record<string, unknown>
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
        return await this.createAcceptedResponse(taskId, contextId, request, taskStore);

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

  private async createAcceptedResponse(
    taskId: string,
    contextId: string,
    request: PaymentRequest,
    taskStore: TaskStore
  ): Promise<TaskStatus> {
    console.log(`[Executor] Accepted payment request - executing real transfer...`);

    let transactionHash: string | undefined;
    let paymentError: string | undefined;

    // Execute real payment if Locus service is configured
    if (this.config.locusPaymentService) {
      try {
        // Determine if this is immediate or delayed payment
        const isImmediate = !request.proposed_delay_days || request.proposed_delay_days === 0;

        if (isImmediate) {
          console.log(`[Executor] Executing immediate payment of $${request.amount} to ${request.to_agent}`);

          // Execute the payment
          const paymentResult = await this.config.locusPaymentService.sendPayment({
            toAddress: request.to_agent, // Assuming to_agent is the wallet address
            amount: String(request.amount),
            memo: `Payment for: ${request.reason || 'A2A payment'}`
          });

          if (paymentResult.success) {
            transactionHash = paymentResult.transactionHash;
            console.log(`[Executor] ✅ Payment successful! TX: ${transactionHash}`);

            // Report payment to credit server (non-blocking)
            try {
              const now = new Date().toISOString();
              await reportPayment({
                payer_wallet: this.config.walletAddress,
                payee_wallet: request.from_agent, // The requester is the payee
                amount: String(request.amount),
                currency: request.currency || 'USD',
                due_date: request.due_date,
                payment_date: now,
                status: 'on_time'
              });
              console.log(`[Executor] ✅ Payment reported to credit server`);
            } catch (reportError) {
              const errorMsg = reportError instanceof Error ? reportError.message : String(reportError);
              console.warn(`[Executor] ⚠️  Could not report payment to credit server: ${errorMsg}`);
              console.warn(`[Executor] Credit server may be offline at ${process.env.CREDIT_SERVER_URL || 'http://localhost:8000'}`);
              console.warn(`[Executor] Payment still succeeded, but credit history not updated`);
            }
          } else {
            paymentError = paymentResult.error;
            console.error(`[Executor] ❌ Payment failed: ${paymentError}`);
          }
        } else {
          console.log(`[Executor] Accepted delayed payment (${request.proposed_delay_days} days) - will execute later`);
          // For delayed payments, we accept but don't execute now
          // In production, you'd schedule this for later execution
        }
      } catch (error) {
        paymentError = error instanceof Error ? error.message : String(error);
        console.error(`[Executor] Payment execution error:`, error);
      }
    } else {
      console.warn(`[Executor] ⚠️  No Locus service configured - payment not executed`);
      paymentError = 'No Locus payment service configured';
    }

    const response: PaymentResponse = {
      type: 'payment_response',
      request_id: taskId,
      decision: 'accepted',
      reason: transactionHash
        ? `Payment of $${request.amount} executed successfully. TX: ${transactionHash}`
        : paymentError
          ? `Payment accepted but execution failed: ${paymentError}`
          : `Payment of $${request.amount} with ${request.proposed_delay_days || 0} days delay accepted`
    };

    taskStore.setMetadata(taskId, 'response', response);
    if (transactionHash) {
      taskStore.setMetadata(taskId, 'transactionHash', transactionHash);
    }

    const message: Message = {
      kind: 'message',
      messageId: uuidv4(),
      role: 'agent',
      taskId,
      contextId,
      parts: [
        {
          kind: 'text',
          text: transactionHash
            ? `✅ Payment executed! $${request.amount} ${request.currency}\nTransaction: ${transactionHash}`
            : paymentError
              ? `⚠️  Accepted but payment failed: ${paymentError}`
              : `Accepted payment request for $${request.amount} ${request.currency}`
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
