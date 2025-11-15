import 'dotenv/config';

/**
 * Credit Checking Server API Tools
 *
 * These tools wrap the credit checking server APIs to allow the agent to:
 * - Query credit scores of other agents
 * - View payment history
 * - Report payment events
 */

const CREDIT_SERVER_URL = process.env.CREDIT_SERVER_URL || 'http://localhost:8000';
const AGENT_WALLET = process.env.AGENT_WALLET_ADDRESS || '0xDEFAULT_AGENT_WALLET';

// Tool definitions that Claude Agent SDK can use
export const creditCheckingTools = [
  {
    name: 'get_credit_score',
    description: 'Get the credit score of another agent to assess their creditworthiness before accepting delayed payments. Credit scores range from 0-100, with 70 being the default for new agents. Higher scores indicate more reliable payment history.',
    input_schema: {
      type: 'object',
      properties: {
        agent_wallet: {
          type: 'string',
          description: 'The wallet address of the agent to check (e.g., 0x1234567890abcdef...)'
        }
      },
      required: ['agent_wallet']
    }
  },
  {
    name: 'get_payment_history',
    description: 'Get detailed payment history for an agent, including all their past payments as payer and/or payee. Useful for understanding payment patterns and reliability.',
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

/**
 * Tool execution functions
 */

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

export async function getCreditScore(agent_wallet: string): Promise<CreditScoreResponse> {
  const url = `${CREDIT_SERVER_URL}/credit-score/${agent_wallet}`;

  // For now, we'll make requests without x402 payment
  // In production, this should handle the 402 flow
  const headers = {
    'X-Agent-Wallet': AGENT_WALLET,
    // x402 headers would go here in production:
    // 'X-402-Payment-Proof': payment_proof,
    // 'X-402-Amount': '0.002',
    // 'X-402-Signature': signature
  };

  const response = await fetch(url, { headers });

  if (response.status === 402) {
    // Payment required - for now we'll throw an error
    // In production, this should trigger the x402 payment flow
    const paymentInfo = await response.json() as { payment_details?: { amount?: string } };
    throw new Error(`Payment required: $${paymentInfo.payment_details?.amount || '0.002'} USD. X402 payment flow not yet implemented.`);
  }

  if (!response.ok) {
    const error = await response.json() as { message?: string };
    throw new Error(`Failed to get credit score: ${error.message || response.statusText}`);
  }

  return await response.json() as CreditScoreResponse;
}

export async function getPaymentHistory(
  agent_wallet: string,
  role: string = 'all',
  page: number = 1,
  page_size: number = 50
): Promise<PaymentHistoryResponse> {
  const params = new URLSearchParams({
    role,
    page: page.toString(),
    page_size: page_size.toString()
  });

  const url = `${CREDIT_SERVER_URL}/payment-history/${agent_wallet}?${params}`;

  const headers = {
    'X-Agent-Wallet': AGENT_WALLET,
    // x402 headers would go here in production
  };

  const response = await fetch(url, { headers });

  if (response.status === 402) {
    const paymentInfo = await response.json() as { payment_details?: { amount?: string } };
    throw new Error(`Payment required: $${paymentInfo.payment_details?.amount || '0.001'} USD. X402 payment flow not yet implemented.`);
  }

  if (!response.ok) {
    const error = await response.json() as { message?: string };
    throw new Error(`Failed to get payment history: ${error.message || response.statusText}`);
  }

  return await response.json() as PaymentHistoryResponse;
}

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

export async function checkCreditServer(): Promise<{ status: string; timestamp: string; version: string }> {
  const url = `${CREDIT_SERVER_URL}/health`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Credit server health check failed: ${response.statusText}`);
  }

  return await response.json() as { status: string; timestamp: string; version: string };
}

/**
 * Tool executor - maps tool names to execution functions
 */
export async function executeCreditTool(toolName: string, input: Record<string, unknown>): Promise<unknown> {
  switch (toolName) {
    case 'get_credit_score':
      return await getCreditScore(input.agent_wallet as string);

    case 'get_payment_history':
      return await getPaymentHistory(
        input.agent_wallet as string,
        (input.role as string) || 'all',
        (input.page as number) || 1,
        (input.page_size as number) || 50
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
