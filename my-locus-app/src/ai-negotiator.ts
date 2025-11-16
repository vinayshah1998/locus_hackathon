/**
 * AI Negotiator - Uses Claude Agent SDK for intelligent payment negotiation
 * Replaces hardcoded decision trees with AI reasoning
 */

import 'dotenv/config';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { PersonalityConfig } from './personality.js';
import { PaymentRequest } from './a2a-types.js';
import { creditCheckingTools, executeCreditTool } from '../tools.js';

export interface NegotiationContext {
  paymentRequest: PaymentRequest;
  personality: PersonalityConfig;
  agentWallet: string;
  agentName: string;
}

export interface AIDecision {
  decision: 'accept' | 'reject' | 'counter_offer' | 'ask_user';
  reason: string;
  counterOfferDays?: number;
  confidence: 'high' | 'medium' | 'low';
  toolsUsed: string[];
}

export class AINegotiator {
  async evaluatePaymentRequest(context: NegotiationContext): Promise<AIDecision> {
    const { paymentRequest, personality, agentName } = context;

    console.log(`\n[AINegotiator] Claude AI evaluating payment request...`);
    console.log(`  Personality: ${personality.name}`);
    console.log(`  Autonomy: ${personality.autonomyLevel}`);

    // Build the user prompt with payment request details
    const userPrompt = this.buildUserPrompt(paymentRequest, agentName);

    // Configure Claude SDK with credit checking tools
    const options = {
      tools: creditCheckingTools,
      allowedTools: ['get_credit_score', 'get_payment_history'],
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxTurns: 5, // Allow multiple tool calls for thorough analysis
      systemPrompt: personality.systemPromptTemplate,
      canUseTool: async (toolName: string, input: Record<string, unknown>) => {
        if (['get_credit_score', 'get_payment_history'].includes(toolName)) {
          console.log(`  [AI] Using tool: ${toolName}`);
          return {
            behavior: 'allow' as const,
            updatedInput: input
          };
        }
        return {
          behavior: 'deny' as const,
          message: 'Only credit checking tools are allowed'
        };
      },
      executeTool: async (toolName: string, input: Record<string, unknown>) => {
        if (['get_credit_score', 'get_payment_history'].includes(toolName)) {
          try {
            const result = await executeCreditTool(toolName, input);
            console.log(`  [AI] Tool ${toolName} result:`, JSON.stringify(result).substring(0, 200));
            return {
              success: true,
              result
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log(`  [AI] Tool ${toolName} error: ${errorMessage}`);
            return {
              success: false,
              error: errorMessage
            };
          }
        }
        return undefined;
      }
    };

    let fullResponse = '';
    const toolsUsed: string[] = [];

    try {
      // Query Claude with the payment request
      for await (const message of query({
        prompt: userPrompt,
        options
      })) {
        if (message.type === 'assistant') {
          const content = (message as { content?: unknown }).content;

          if (typeof content === 'string') {
            fullResponse += content;
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if ((block as { type?: string }).type === 'text' && (block as { text?: string }).text) {
                fullResponse += (block as { text: string }).text;
              } else if ((block as { type?: string }).type === 'tool_use') {
                const toolName = (block as { name?: string }).name || 'unknown';
                if (!toolsUsed.includes(toolName)) {
                  toolsUsed.push(toolName);
                }
              }
            }
          }
        } else if (message.type === 'result') {
          if (message.subtype === 'success') {
            const result = (message as { result?: unknown }).result;
            if (result && typeof result === 'string' && !fullResponse) {
              fullResponse = result;
            }
          }
        }
      }

      console.log(`\n[AINegotiator] Claude's reasoning:\n${fullResponse.substring(0, 500)}...`);

      // Parse Claude's response into structured decision
      const decision = this.parseAIResponse(fullResponse, toolsUsed);
      console.log(`[AINegotiator] Parsed decision:`, decision);

      return decision;

    } catch (error) {
      console.error('[AINegotiator] Error during AI evaluation:', error);

      // Fallback to safe default
      return {
        decision: 'ask_user',
        reason: 'AI evaluation failed, deferring to user',
        confidence: 'low',
        toolsUsed: []
      };
    }
  }

  private buildUserPrompt(request: PaymentRequest, agentName: string): string {
    return `You are evaluating a payment request for ${agentName}.

PAYMENT REQUEST DETAILS:
- From Agent: ${request.from_agent}
- Amount: $${request.amount} ${request.currency}
- Requested Delay: ${request.proposed_delay_days || 0} days
- Due Date: ${request.due_date}
- Reason: ${request.reason || 'Not specified'}

TASK:
1. Use your available tools to check the requester's creditworthiness
2. Analyze their credit score and payment history based on your personality guidelines
3. Make a decision: ACCEPT, REJECT, COUNTER_OFFER, or ASK_USER

RESPOND WITH YOUR DECISION IN THIS EXACT FORMAT:
DECISION: [ACCEPT|REJECT|COUNTER_OFFER|ASK_USER]
REASON: [Your detailed reasoning explaining why you made this decision]
CONFIDENCE: [HIGH|MEDIUM|LOW]
${request.proposed_delay_days && request.proposed_delay_days > 0 ? 'COUNTER_DELAY_DAYS: [number, only if COUNTER_OFFER]' : ''}

Start by checking the credit score, then make your decision based on your personality guidelines.`;
  }

  private parseAIResponse(response: string, toolsUsed: string[]): AIDecision {
    // Default fallback
    const defaultDecision: AIDecision = {
      decision: 'ask_user',
      reason: 'Unable to parse AI response clearly',
      confidence: 'low',
      toolsUsed
    };

    if (!response) {
      return defaultDecision;
    }

    // Extract DECISION
    const decisionMatch = response.match(/DECISION:\s*(ACCEPT|REJECT|COUNTER_OFFER|ASK_USER)/i);
    if (!decisionMatch) {
      // Try to infer from text
      if (response.toLowerCase().includes('accept')) {
        defaultDecision.decision = 'accept';
        defaultDecision.reason = response.substring(0, 500);
      } else if (response.toLowerCase().includes('reject')) {
        defaultDecision.decision = 'reject';
        defaultDecision.reason = response.substring(0, 500);
      }
      return defaultDecision;
    }

    const decisionText = decisionMatch[1].toUpperCase();
    let decision: AIDecision['decision'] = 'ask_user';

    switch (decisionText) {
      case 'ACCEPT':
        decision = 'accept';
        break;
      case 'REJECT':
        decision = 'reject';
        break;
      case 'COUNTER_OFFER':
        decision = 'counter_offer';
        break;
      case 'ASK_USER':
        decision = 'ask_user';
        break;
    }

    // Extract REASON
    const reasonMatch = response.match(/REASON:\s*(.+?)(?=CONFIDENCE:|COUNTER_DELAY_DAYS:|$)/is);
    const reason = reasonMatch ? reasonMatch[1].trim() : 'No reason provided';

    // Extract CONFIDENCE
    const confidenceMatch = response.match(/CONFIDENCE:\s*(HIGH|MEDIUM|LOW)/i);
    let confidence: AIDecision['confidence'] = 'medium';
    if (confidenceMatch) {
      confidence = confidenceMatch[1].toLowerCase() as AIDecision['confidence'];
    }

    // Extract COUNTER_DELAY_DAYS if counter_offer
    let counterOfferDays: number | undefined;
    if (decision === 'counter_offer') {
      const counterMatch = response.match(/COUNTER_DELAY_DAYS:\s*(\d+)/i);
      if (counterMatch) {
        counterOfferDays = parseInt(counterMatch[1], 10);
      } else {
        // Default to 14 days if not specified
        counterOfferDays = 14;
      }
    }

    return {
      decision,
      reason,
      confidence,
      counterOfferDays,
      toolsUsed
    };
  }
}
