/**
 * Conversational Agent - Natural Language Interface
 * Translates user requests into structured A2A messages and vice versa
 */

import 'dotenv/config';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { A2AClient, AgentRegistry } from './agent-client.js';
import { PersonalityConfig } from './personality.js';

export interface ConversationContext {
  agentName: string;
  agentWallet: string;
  personality: PersonalityConfig;
  knownAgents: Record<string, { name: string; wallet: string; url: string }>;
  agentRegistry: AgentRegistry;
}

export interface ParsedIntent {
  type: 'payment_request' | 'check_status' | 'respond_to_offer' | 'unknown';
  targetAgent?: string;
  amount?: number;
  currency?: string;
  delayDays?: number;
  reason?: string;
  response?: 'accept' | 'reject' | 'counter';
  counterAmount?: number;
  counterDelayDays?: number;
  rawText: string;
}

const NLP_PARSER_PROMPT = `You are a natural language parser for a payment negotiation system.

Extract the user's intent from their message and return a JSON object.

POSSIBLE INTENTS:
1. payment_request - User wants to request payment from someone
2. respond_to_offer - User is responding to a payment offer (accept, reject, counter)
3. check_status - User wants to check pending requests
4. unknown - Cannot determine intent

For payment_request, extract:
- targetAgent: Name of the person (bob, alice, etc.)
- amount: Dollar amount (number)
- currency: USD (default)
- delayDays: Number of days for payment (0 = today/immediate)
- reason: Why the payment is needed (optional)

For respond_to_offer, extract:
- response: accept, reject, or counter
- counterAmount: If countering with different amount
- counterDelayDays: If countering with different delay

EXAMPLES:
"Ask bob to pay me $50 for dinner" → {"type":"payment_request","targetAgent":"bob","amount":50,"currency":"USD","delayDays":0,"reason":"dinner"}
"Tell alice I need the $100 she owes me today" → {"type":"payment_request","targetAgent":"alice","amount":100,"currency":"USD","delayDays":0,"reason":"money owed"}
"Request $500 from bob, he can pay in 30 days" → {"type":"payment_request","targetAgent":"bob","amount":500,"currency":"USD","delayDays":30}
"I accept bob's offer" → {"type":"respond_to_offer","response":"accept"}
"Counter with $0.50 instead" → {"type":"respond_to_offer","response":"counter","counterAmount":0.5}

RESPOND WITH ONLY THE JSON OBJECT, NO OTHER TEXT.`;

export class ConversationalAgent {
  private context: ConversationContext;

  constructor(context: ConversationContext) {
    this.context = context;
  }

  async processUserInput(userInput: string): Promise<string> {
    console.log(`\n[ConversationalAgent] Processing: "${userInput}"`);

    // Parse user intent using Claude
    const intent = await this.parseIntent(userInput);
    console.log(`[ConversationalAgent] Parsed intent:`, intent);

    if (intent.type === 'unknown') {
      return `I didn't understand that. Try saying something like:\n` +
        `- "Ask bob to pay me $50 for dinner"\n` +
        `- "Request $100 from alice, she can pay in 14 days"\n` +
        `- "Tell bob I need the money he owes me today"`;
    }

    if (intent.type === 'payment_request') {
      return await this.handlePaymentRequest(intent);
    }

    if (intent.type === 'check_status') {
      return `Use the 'pending' command to check pending requests.`;
    }

    if (intent.type === 'respond_to_offer') {
      return `Use the 'decide' command to respond to pending offers.`;
    }

    return `I understood your intent (${intent.type}) but can't process it yet.`;
  }

  private async parseIntent(userInput: string): Promise<ParsedIntent> {
    try {
      let fullResponse = '';

      for await (const message of query({
        prompt: `Parse this user input:\n"${userInput}"\n\nRespond with ONLY the JSON object.`,
        options: {
          systemPrompt: NLP_PARSER_PROMPT
        }
      })) {
        if (message.type === 'assistant') {
          const content = (message as { content?: unknown }).content;
          if (typeof content === 'string') {
            fullResponse += content;
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if ((block as { type?: string }).type === 'text') {
                fullResponse += (block as { text?: string }).text || '';
              }
            }
          }
        } else if (message.type === 'result' && message.subtype === 'success') {
          const result = (message as { result?: unknown }).result;
          if (result && typeof result === 'string' && !fullResponse) {
            fullResponse = result;
          }
        }
      }

      // Extract JSON from response
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { ...parsed, rawText: userInput };
      }

      return { type: 'unknown', rawText: userInput };
    } catch (error) {
      console.error('[ConversationalAgent] Parse error:', error);
      return { type: 'unknown', rawText: userInput };
    }
  }

  private async handlePaymentRequest(intent: ParsedIntent): Promise<string> {
    if (!intent.targetAgent) {
      return `I need to know who to request payment from. Try: "Ask [name] to pay me..."`;
    }

    if (!intent.amount || intent.amount <= 0) {
      return `I need to know the amount. Try: "Ask ${intent.targetAgent} to pay me $[amount]"`;
    }

    // Resolve agent name
    const agentName = intent.targetAgent.toLowerCase();
    const targetInfo = this.context.knownAgents[agentName];

    if (!targetInfo) {
      return `I don't know agent "${intent.targetAgent}". Known agents: ${Object.keys(this.context.knownAgents).join(', ')}`;
    }

    // Get client for target agent
    const client = await this.context.agentRegistry.getClient(
      targetInfo.wallet,
      this.context.agentWallet
    );

    if (!client) {
      return `Cannot connect to ${targetInfo.name}'s agent. Make sure they're online at ${targetInfo.url}`;
    }

    const delayDays = intent.delayDays || 0;
    const amount = intent.amount;
    const reason = intent.reason || 'payment request';

    console.log(`[ConversationalAgent] Sending request to ${targetInfo.name}:`);
    console.log(`  Amount: $${amount}`);
    console.log(`  Delay: ${delayDays} days`);
    console.log(`  Reason: ${reason}`);

    // Calculate due date
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + delayDays);

    try {
      // Send the request
      const result = await client.sendPaymentRequest(
        targetInfo.wallet,
        amount,
        intent.currency || 'USD',
        dueDate.toISOString(),
        delayDays,
        reason
      );

      // Format natural language response
      return this.formatNaturalResponse(targetInfo.name, amount, delayDays, result);
    } catch (error) {
      console.error('[ConversationalAgent] Request failed:', error);
      return `Failed to send request to ${targetInfo.name}. They might be offline.`;
    }
  }

  private formatNaturalResponse(
    targetName: string,
    requestedAmount: number,
    requestedDelay: number,
    result: { taskId: string; status: { state: string; message?: { parts: Array<{ kind: string; text?: string; data?: Record<string, unknown> }> } } }
  ): string {
    const status = result.status;
    let response = `📬 Request sent to ${targetName} for $${requestedAmount}`;

    if (requestedDelay > 0) {
      response += ` (${requestedDelay} day payment window)`;
    } else {
      response += ` (immediate payment)`;
    }

    response += `\n\n`;

    // Parse the response
    if (status.state === 'completed' && status.message) {
      const dataParts = status.message.parts.filter((p) => p.kind === 'data');

      if (dataParts.length > 0) {
        const data = dataParts[0].data;

        if (data && data.type === 'payment_response') {
          const decision = data.decision as string;
          const decisionReason = data.reason as string;

          if (decision === 'accepted') {
            response += `✅ ${targetName} ACCEPTED your request!\n`;
            response += `They agreed to pay $${requestedAmount}`;
            if (requestedDelay > 0) {
              response += ` within ${requestedDelay} days`;
            }
            response += `.`;
          } else if (decision === 'rejected') {
            response += `❌ ${targetName} REJECTED your request.\n`;
            response += `Reason: ${decisionReason}`;
          } else if (decision === 'counter_offer') {
            const counterOffer = data.counter_offer as { delay_days?: number; partial_amount?: number } | undefined;
            response += `🔄 ${targetName} made a COUNTER-OFFER:\n`;

            if (counterOffer?.delay_days) {
              response += `They can pay in ${counterOffer.delay_days} days (you requested ${requestedDelay} days)\n`;
            }
            if (counterOffer?.partial_amount) {
              response += `They can pay $${counterOffer.partial_amount} now (you requested $${requestedAmount})\n`;
            }

            response += `\nReason: ${decisionReason}\n`;
            response += `\nYou can accept, reject, or make your own counter-offer.`;
          }
        }
      }

      // Add text reasoning if available
      const textParts = status.message.parts.filter((p) => p.kind === 'text');
      if (textParts.length > 0 && textParts[0].text) {
        const aiReasoning = textParts[0].text;
        if (aiReasoning.length < 500) {
          response += `\n\nAI Reasoning: ${aiReasoning}`;
        }
      }
    } else if (status.state === 'input-required') {
      response += `⏳ ${targetName}'s agent is waiting for their human to decide.\n`;
      response += `Task ID: ${result.taskId.substring(0, 8)}...`;
    } else if (status.state === 'failed') {
      response += `❌ Request failed: ${status.state}`;
    } else {
      response += `Status: ${status.state}`;
    }

    return response;
  }
}
