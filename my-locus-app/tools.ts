import 'dotenv/config';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

/**
 * Credit Checking Server API Tools
 *
 * These tools wrap the credit checking server APIs to allow the agent to:
 * - Query credit scores of other agents
 * - View payment history
 * - Report payment events
 *
 * Supports both:
 * 1. MCP Server mode (for CLI chat interface)
 * 2. Direct function calls (for A2A agent SDK)
 */

const CREDIT_SERVER_URL = process.env.CREDIT_SERVER_URL || 'http://localhost:8000';
const AGENT_WALLET = process.env.AGENT_WALLET_ADDRESS || '0xDEFAULT_AGENT_WALLET';

// ============================================================================
// MCP SERVER EXPORT (for CLI mode)
// ============================================================================

/**
 * Create MCP server with credit checking tools
 */
export const creditCheckingServer = createSdkMcpServer({
  name: 'credit-checking',
  version: '1.0.0',
  tools: [
    tool(
      'check_credit_server',
      'Check if the credit checking server is running and healthy. Use this to verify connectivity before making other API calls.',
      {},
      async () => {
        const url = `${CREDIT_SERVER_URL}/health`;
        const response = await fetch(url);

        if (!response.ok) {
          return {
            content: [{
              type: 'text',
              text: `Credit server health check failed: ${response.statusText}`
            }]
          };
        }

        const data = await response.json() as any;
        return {
          content: [{
            type: 'text',
            text: `Credit server is healthy!\nStatus: ${data.status}\nVersion: ${data.version}\nTimestamp: ${data.timestamp}`
          }]
        };
      }
    ),

    tool(
      'get_credit_score',
      'Get the credit score of another agent to assess their creditworthiness before accepting delayed payments. Credit scores range from 0-100, with 70 being the default for new agents. Higher scores indicate more reliable payment history. This endpoint costs $0.002 USD and requires x402 payment.',
      {
        agent_wallet: z.string().describe('The wallet address of the agent to check (e.g., 0x1234567890abcdef...)'),
        payment_proof: z.string().optional().describe('X402 payment proof (transaction hash) if payment was already made'),
        payment_amount: z.string().optional().describe('Amount paid (e.g., "0.002")'),
        payment_signature: z.string().optional().describe('Payment transaction signature')
      },
      async (args) => {
        const url = `${CREDIT_SERVER_URL}/credit-score/${args.agent_wallet}`;

        const headers: Record<string, string> = {
          'X-Agent-Wallet': AGENT_WALLET,
        };

        // Include x402 payment headers if provided
        if (args.payment_proof && args.payment_amount && args.payment_signature) {
          headers['X-402-Payment-Proof'] = args.payment_proof;
          headers['X-402-Amount'] = args.payment_amount;
          headers['X-402-Signature'] = args.payment_signature;
        }

        const response = await fetch(url, { headers });

        if (response.status === 402) {
          const paymentInfo = await response.json();
          const paymentDetails = (paymentInfo as any).payment_details;

          return {
            content: [{
              type: 'text',
              text: `❌ Payment Required ($${paymentDetails?.amount || '0.002'} USD)

To complete this request, you must:

1. Send payment using: mcp__locus__send_to_address
   - address: ${paymentDetails?.payment_address || 'UNKNOWN'}
   - amount: ${paymentDetails?.amount || '0.002'}
   - memo: "Credit score check for ${args.agent_wallet}"

2. After payment completes, call this tool again with:
   - payment_proof: [transaction hash from Locus]
   - payment_amount: "${paymentDetails?.amount || '0.002'}"
   - payment_signature: [transaction signature from Locus]

Payment Details:
- Amount: $${paymentDetails?.amount || '0.002'} USD
- Recipient: ${paymentDetails?.payment_address || 'UNKNOWN'}
- Endpoint: ${paymentDetails?.endpoint || 'credit-score'}
- Instructions: ${(paymentInfo as any).instructions || 'Include payment proof in retry'}`
            }]
          };
        }

        if (!response.ok) {
          const error = await response.json();
          return {
            content: [{
              type: 'text',
              text: `Failed to get credit score: ${(error as any).message || response.statusText}`
            }]
          };
        }

        const data = await response.json() as any;
        const scoreText = `✅ Credit Score Retrieved (Paid $0.002)

Credit Score for ${args.agent_wallet}:
- Score: ${data.credit_score}/100
- Last Updated: ${data.last_updated}
- Total Payments: ${data.payments_count}
- New Agent: ${data.is_new_agent ? 'Yes' : 'No'}

Interpretation:
${data.credit_score >= 90 ? '✅ Excellent - Very reliable' :
  data.credit_score >= 80 ? '✅ Good - Reliable' :
  data.credit_score >= 70 ? '⚠️  Fair - Average reliability' :
  data.credit_score >= 60 ? '⚠️  Poor - Some issues' :
  '❌ Bad - High risk'}`;

        return {
          content: [{
            type: 'text',
            text: scoreText
          }]
        };
      }
    ),

    tool(
      'get_payment_history',
      'Get detailed payment history for an agent, including all their past payments as payer and/or payee. Useful for understanding payment patterns and reliability. This endpoint costs $0.001 USD and requires x402 payment.',
      {
        agent_wallet: z.string().describe('The wallet address of the agent to check'),
        role: z.enum(['all', 'payer', 'payee']).default('all').describe('Filter by role: "all", "payer", or "payee"'),
        page: z.number().default(1).describe('Page number for pagination'),
        page_size: z.number().default(50).describe('Number of events per page (max: 200)'),
        payment_proof: z.string().optional().describe('X402 payment proof (transaction hash) if payment was already made'),
        payment_amount: z.string().optional().describe('Amount paid (e.g., "0.001")'),
        payment_signature: z.string().optional().describe('Payment transaction signature')
      },
      async (args) => {
        const params = new URLSearchParams({
          role: args.role,
          page: args.page.toString(),
          page_size: args.page_size.toString()
        });

        const url = `${CREDIT_SERVER_URL}/payment-history/${args.agent_wallet}?${params}`;

        const headers: Record<string, string> = {
          'X-Agent-Wallet': AGENT_WALLET,
        };

        // Include x402 payment headers if provided
        if (args.payment_proof && args.payment_amount && args.payment_signature) {
          headers['X-402-Payment-Proof'] = args.payment_proof;
          headers['X-402-Amount'] = args.payment_amount;
          headers['X-402-Signature'] = args.payment_signature;
        }

        const response = await fetch(url, { headers });

        if (response.status === 402) {
          const paymentInfo = await response.json();
          const paymentDetails = (paymentInfo as any).payment_details;

          return {
            content: [{
              type: 'text',
              text: `❌ Payment Required ($${paymentDetails?.amount || '0.001'} USD)

To complete this request, you must:

1. Send payment using: mcp__locus__send_to_address
   - address: ${paymentDetails?.payment_address || 'UNKNOWN'}
   - amount: ${paymentDetails?.amount || '0.001'}
   - memo: "Payment history check for ${args.agent_wallet}"

2. After payment completes, call this tool again with:
   - payment_proof: [transaction hash from Locus]
   - payment_amount: "${paymentDetails?.amount || '0.001'}"
   - payment_signature: [transaction signature from Locus]

Payment Details:
- Amount: $${paymentDetails?.amount || '0.001'} USD
- Recipient: ${paymentDetails?.payment_address || 'UNKNOWN'}
- Endpoint: ${paymentDetails?.endpoint || 'payment-history'}
- Instructions: ${(paymentInfo as any).instructions || 'Include payment proof in retry'}`
            }]
          };
        }

        if (!response.ok) {
          const error = await response.json();
          return {
            content: [{
              type: 'text',
              text: `Failed to get payment history: ${(error as any).message || response.statusText}`
            }]
          };
        }

        const data = await response.json() as any;

        if (data.total_count === 0) {
          return {
            content: [{
              type: 'text',
              text: `✅ Payment History Retrieved (Paid $0.001)

No payment history found for ${args.agent_wallet}`
            }]
          };
        }

        const payments = data.payments || [];
        const onTime = payments.filter((p: any) => p.status === 'on_time').length;
        const late = payments.filter((p: any) => p.status === 'late').length;
        const defaulted = payments.filter((p: any) => p.status === 'defaulted').length;

        let historyText = `✅ Payment History Retrieved (Paid $0.001)

Payment History for ${args.agent_wallet}:

Summary:
- Total Payments: ${data.total_count}
- On-time: ${onTime} (${data.total_count > 0 ? ((onTime / data.total_count) * 100).toFixed(1) : 0}%)
- Late: ${late}
- Defaulted: ${defaulted}
- Current Page: ${data.page} of ${data.total_pages}

Recent Payments:\n`;

        payments.slice(0, 5).forEach((payment: any) => {
          historyText += `\n• ${payment.status.toUpperCase()} - $${payment.amount} ${payment.currency}`;
          historyText += `\n  ${payment.payer_wallet === args.agent_wallet ? 'Paid to' : 'Received from'}: ${payment.payer_wallet === args.agent_wallet ? payment.payee_wallet : payment.payer_wallet}`;
          historyText += `\n  Due: ${payment.due_date}, Paid: ${payment.payment_date || 'Never'}`;
          if (payment.days_overdue > 0) {
            historyText += `\n  Days overdue: ${payment.days_overdue}`;
          }
        });

        return {
          content: [{
            type: 'text',
            text: historyText
          }]
        };
      }
    ),

    tool(
      'report_payment',
      'Report a payment event to the credit checking server. This updates credit scores for both payer and payee. Use this after completing a payment to build credit history. This endpoint is FREE (no payment required).',
      {
        payer_wallet: z.string().describe('Wallet address of the party making the payment'),
        payee_wallet: z.string().describe('Wallet address of the party receiving the payment'),
        amount: z.string().describe('Payment amount (e.g., "150.00")'),
        currency: z.string().default('USD').describe('Currency code'),
        due_date: z.string().describe('ISO 8601 datetime when payment was due (e.g., "2025-11-10T00:00:00Z")'),
        payment_date: z.string().optional().describe('ISO 8601 datetime when payment was actually made. Omit if defaulted.'),
        status: z.enum(['on_time', 'late', 'defaulted']).describe('Payment status')
      },
      async (args) => {
        const url = `${CREDIT_SERVER_URL}/report-payment`;

        const headers = {
          'X-Agent-Wallet': AGENT_WALLET,
          'Content-Type': 'application/json'
        };

        const body: any = {
          payer_wallet: args.payer_wallet,
          payee_wallet: args.payee_wallet,
          amount: args.amount,
          currency: args.currency,
          due_date: args.due_date,
          status: args.status
        };

        if (args.payment_date) {
          body.payment_date = args.payment_date;
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const error = await response.json();
          return {
            content: [{
              type: 'text',
              text: `Failed to report payment: ${(error as any).message || response.statusText}`
            }]
          };
        }

        const data = await response.json() as any;
        const resultText = `Payment Reported Successfully!

Event ID: ${data.event_id}
Status: ${data.status}
Days Overdue: ${data.days_overdue}
Reported At: ${data.reported_at}

Credit Scores Updated:
- Payer (${args.payer_wallet}): ${data.new_credit_scores?.payer || 'N/A'}
- Payee (${args.payee_wallet}): ${data.new_credit_scores?.payee || 'N/A'}`;

        return {
          content: [{
            type: 'text',
            text: resultText
          }]
        };
      }
    )
  ]
});

// ============================================================================
// A2A SDK TOOL DEFINITIONS (for agent-to-agent mode)
// ============================================================================

/**
 * Tool definitions in JSON Schema format for Claude Agent SDK
 * These are used by the A2A negotiation agents
 */
export const creditCheckingTools = [
  {
    name: 'get_credit_score',
    description: 'Get the credit score of another agent to assess their creditworthiness before accepting delayed payments. Credit scores range from 0-100, with 70 being the default for new agents. Higher scores indicate more reliable payment history. This endpoint costs $0.002 USD and requires x402 payment.',
    input_schema: {
      type: 'object',
      properties: {
        agent_wallet: {
          type: 'string',
          description: 'The wallet address of the agent to check (e.g., 0x1234567890abcdef...)'
        },
        payment_proof: {
          type: 'string',
          description: 'X402 payment proof (transaction hash) if payment was already made'
        },
        payment_amount: {
          type: 'string',
          description: 'Amount paid (e.g., "0.002")'
        },
        payment_signature: {
          type: 'string',
          description: 'Payment transaction signature'
        }
      },
      required: ['agent_wallet']
    }
  },
  {
    name: 'get_payment_history',
    description: 'Get detailed payment history for an agent, including all their past payments as payer and/or payee. Useful for understanding payment patterns and reliability. This endpoint costs $0.001 USD and requires x402 payment.',
    input_schema: {
      type: 'object',
      properties: {
        agent_wallet: {
          type: 'string',
          description: 'The wallet address of the agent to check'
        },
        role: {
          type: 'string',
          enum: ['all', 'payer', 'payee'],
          description: 'Filter by role: "all" (both payer and payee), "payer" (only as payer), "payee" (only as payee)',
          default: 'all'
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 1)',
          default: 1
        },
        page_size: {
          type: 'number',
          description: 'Number of events per page (default: 50, max: 200)',
          default: 50
        },
        payment_proof: {
          type: 'string',
          description: 'X402 payment proof (transaction hash) if payment was already made'
        },
        payment_amount: {
          type: 'string',
          description: 'Amount paid (e.g., "0.001")'
        },
        payment_signature: {
          type: 'string',
          description: 'Payment transaction signature'
        }
      },
      required: ['agent_wallet']
    }
  },
  {
    name: 'report_payment',
    description: 'Report a payment event to the credit checking server. This updates credit scores for both payer and payee. Use this after completing a payment to build credit history. This endpoint is FREE (no payment required).',
    input_schema: {
      type: 'object',
      properties: {
        payer_wallet: {
          type: 'string',
          description: 'Wallet address of the party making the payment'
        },
        payee_wallet: {
          type: 'string',
          description: 'Wallet address of the party receiving the payment'
        },
        amount: {
          type: 'string',
          description: 'Payment amount (e.g., "150.00")'
        },
        currency: {
          type: 'string',
          description: 'Currency code (default: USD)',
          default: 'USD'
        },
        due_date: {
          type: 'string',
          description: 'ISO 8601 datetime when payment was due (e.g., "2025-11-10T00:00:00Z")'
        },
        payment_date: {
          type: 'string',
          description: 'ISO 8601 datetime when payment was actually made. Omit if payment defaulted.'
        },
        status: {
          type: 'string',
          enum: ['on_time', 'late', 'defaulted'],
          description: 'Payment status: "on_time" (paid on or before due date), "late" (paid after due date), "defaulted" (never paid)'
        }
      },
      required: ['payer_wallet', 'payee_wallet', 'amount', 'due_date', 'status']
    }
  },
  {
    name: 'check_credit_server',
    description: 'Check if the credit checking server is running and healthy. Use this to verify connectivity before making other API calls.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

// ============================================================================
// DIRECT FUNCTION EXPORTS (for A2A agent executor)
// These functions mirror the MCP tool logic with full x402 support
// ============================================================================

interface CreditScoreResponse {
  agent_id: string;
  credit_score: number;
  last_updated: string;
  payments_count: number;
  is_new_agent: boolean;
}

interface PaymentHistoryResponse {
  agent_id: string;
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  payments: Array<{
    event_id: string;
    payer_wallet: string;
    payee_wallet: string;
    amount: string;
    currency: string;
    due_date: string;
    payment_date: string | null;
    status: string;
    days_overdue: number;
    reported_at: string;
    reporter_wallet: string;
  }>;
}

interface ReportPaymentResponse {
  event_id: string;
  message: string;
  payer_wallet: string;
  payee_wallet: string;
  amount: string;
  status: string;
  days_overdue: number;
  reported_at: string;
  credit_score_updated: boolean;
  new_credit_scores: {
    payer: number;
    payee: number;
  };
}

interface X402PaymentRequired {
  payment_required: true;
  amount: string;
  payment_address: string;
  endpoint: string;
  instructions: string;
}

/**
 * Get credit score with x402 payment support
 * Returns either the credit score or payment required info
 */
export async function getCreditScore(
  agent_wallet: string,
  payment_proof?: string,
  payment_amount?: string,
  payment_signature?: string
): Promise<CreditScoreResponse | X402PaymentRequired> {
  const url = `${CREDIT_SERVER_URL}/credit-score/${agent_wallet}`;

  const headers: Record<string, string> = {
    'X-Agent-Wallet': AGENT_WALLET,
  };

  // Include x402 payment headers if provided
  if (payment_proof && payment_amount && payment_signature) {
    headers['X-402-Payment-Proof'] = payment_proof;
    headers['X-402-Amount'] = payment_amount;
    headers['X-402-Signature'] = payment_signature;
  }

  const response = await fetch(url, { headers });

  if (response.status === 402) {
    const paymentInfo = await response.json() as { payment_details?: { amount?: string; payment_address?: string }; instructions?: string };
    return {
      payment_required: true,
      amount: paymentInfo.payment_details?.amount || '0.002',
      payment_address: paymentInfo.payment_details?.payment_address || 'UNKNOWN',
      endpoint: 'credit-score',
      instructions: paymentInfo.instructions || 'Include payment proof in retry'
    };
  }

  if (!response.ok) {
    const error = await response.json() as { message?: string };
    throw new Error(`Failed to get credit score: ${error.message || response.statusText}`);
  }

  return await response.json() as CreditScoreResponse;
}

/**
 * Get payment history with x402 payment support
 */
export async function getPaymentHistory(
  agent_wallet: string,
  role: string = 'all',
  page: number = 1,
  page_size: number = 50,
  payment_proof?: string,
  payment_amount?: string,
  payment_signature?: string
): Promise<PaymentHistoryResponse | X402PaymentRequired> {
  const params = new URLSearchParams({
    role,
    page: page.toString(),
    page_size: page_size.toString()
  });

  const url = `${CREDIT_SERVER_URL}/payment-history/${agent_wallet}?${params}`;

  const headers: Record<string, string> = {
    'X-Agent-Wallet': AGENT_WALLET,
  };

  // Include x402 payment headers if provided
  if (payment_proof && payment_amount && payment_signature) {
    headers['X-402-Payment-Proof'] = payment_proof;
    headers['X-402-Amount'] = payment_amount;
    headers['X-402-Signature'] = payment_signature;
  }

  const response = await fetch(url, { headers });

  if (response.status === 402) {
    const paymentInfo = await response.json() as { payment_details?: { amount?: string; payment_address?: string }; instructions?: string };
    return {
      payment_required: true,
      amount: paymentInfo.payment_details?.amount || '0.001',
      payment_address: paymentInfo.payment_details?.payment_address || 'UNKNOWN',
      endpoint: 'payment-history',
      instructions: paymentInfo.instructions || 'Include payment proof in retry'
    };
  }

  if (!response.ok) {
    const error = await response.json() as { message?: string };
    throw new Error(`Failed to get payment history: ${error.message || response.statusText}`);
  }

  return await response.json() as PaymentHistoryResponse;
}

/**
 * Report payment (FREE - no x402 payment required)
 */
export async function reportPayment(paymentData: {
  payer_wallet: string;
  payee_wallet: string;
  amount: string;
  currency?: string;
  due_date: string;
  payment_date?: string;
  status: 'on_time' | 'late' | 'defaulted';
}): Promise<ReportPaymentResponse> {
  const url = `${CREDIT_SERVER_URL}/report-payment`;

  const headers = {
    'X-Agent-Wallet': AGENT_WALLET,
    'Content-Type': 'application/json'
  };

  const body = {
    ...paymentData,
    currency: paymentData.currency || 'USD'
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.json() as { message?: string };
    throw new Error(`Failed to report payment: ${error.message || response.statusText}`);
  }

  return await response.json() as ReportPaymentResponse;
}

/**
 * Check credit server health
 */
export async function checkCreditServer(): Promise<{ status: string; timestamp: string; version: string }> {
  const url = `${CREDIT_SERVER_URL}/health`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Credit server health check failed: ${response.statusText}`);
  }

  return await response.json() as { status: string; timestamp: string; version: string };
}

/**
 * Tool executor - maps tool names to execution functions for A2A SDK
 * Returns structured results that can include payment requirements
 */
export async function executeCreditTool(toolName: string, input: Record<string, unknown>): Promise<unknown> {
  switch (toolName) {
    case 'get_credit_score':
      return await getCreditScore(
        input.agent_wallet as string,
        input.payment_proof as string | undefined,
        input.payment_amount as string | undefined,
        input.payment_signature as string | undefined
      );

    case 'get_payment_history':
      return await getPaymentHistory(
        input.agent_wallet as string,
        (input.role as string) || 'all',
        (input.page as number) || 1,
        (input.page_size as number) || 50,
        input.payment_proof as string | undefined,
        input.payment_amount as string | undefined,
        input.payment_signature as string | undefined
      );

    case 'report_payment':
      return await reportPayment(input as {
        payer_wallet: string;
        payee_wallet: string;
        amount: string;
        currency?: string;
        due_date: string;
        payment_date?: string;
        status: 'on_time' | 'late' | 'defaulted';
      });

    case 'check_credit_server':
      return await checkCreditServer();

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// Export type for x402 payment detection
export type { X402PaymentRequired };
