/**
 * Agent Card Definition
 * Defines the payment negotiation agent's capabilities and identity
 */

import { AgentCard } from './a2a-types.js';

export function createAgentCard(
  agentName: string,
  agentUrl: string,
  walletAddress: string
): AgentCard {
  return {
    name: agentName,
    description: `Payment negotiation agent representing wallet ${walletAddress}. This agent can negotiate payment terms, check creditworthiness, and handle payment requests on behalf of its owner.`,
    protocolVersion: '0.3.0',
    version: '1.0.0',
    url: agentUrl,
    preferredTransport: 'JSONRPC',
    skills: [
      {
        id: 'payment-negotiation',
        name: 'Payment Negotiation',
        description: 'Negotiate payment terms with other agents. Can request delayed payments, accept or reject payment proposals, and make counter-offers based on credit scores and configured personality.',
        tags: ['payment', 'negotiation', 'credit', 'finance'],
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['payment_request', 'payment_response']
            },
            amount: { type: 'number' },
            currency: { type: 'string' },
            due_date: { type: 'string', format: 'date-time' },
            proposed_delay_days: { type: 'number' }
          }
        }
      },
      {
        id: 'credit-check',
        name: 'Credit Check',
        description: 'Check the creditworthiness of other agents before accepting payment terms.',
        tags: ['credit', 'risk', 'assessment']
      },
      {
        id: 'payment-reporting',
        name: 'Payment Reporting',
        description: 'Report completed payments to update credit scores and payment history.',
        tags: ['payment', 'reporting', 'credit']
      }
    ],
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true
    },
    securitySchemes: {
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Agent-API-Key'
      }
    }
  };
}
