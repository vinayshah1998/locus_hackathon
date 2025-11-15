# Credit Checking Tools Integration

This document describes the credit checking tools integrated into the Locus Payment Agent.

## Overview

The agent now has access to 4 credit checking tools that interact with the credit checking server. These tools enable the agent to query credit scores, view payment histories, and report payment events.

## Available Tools

### 1. `check_credit_server`

**Purpose**: Verify that the credit checking server is online and accessible.

**Parameters**: None

**Example Usage**:
```
"Check if the credit server is running"
```

**Returns**:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-15T10:00:00Z",
  "version": "1.0.0"
}
```

---

### 2. `get_credit_score`

**Purpose**: Get the credit score of another agent to assess their creditworthiness.

**Parameters**:
- `agent_wallet` (string, required): Wallet address of the agent to check

**Pricing**: $0.002 USD (currently not enforced in demo mode)

**Example Usage**:
```
"What is the credit score for agent 0xAGENT_BOB_WALLET_002?"
```

**Returns**:
```json
{
  "agent_id": "0xAGENT_BOB_WALLET_002",
  "credit_score": 85,
  "last_updated": "2025-11-15T09:30:00Z",
  "payments_count": 42,
  "is_new_agent": false
}
```

**Credit Score Interpretation**:
- **90-100**: Excellent - Very reliable, safe to accept delayed payments
- **80-89**: Good - Reliable, reasonable to accept delayed payments
- **70-79**: Fair - Average reliability (default for new agents)
- **60-69**: Poor - Some payment issues, be cautious
- **0-59**: Bad - High default risk, demand immediate payment

---

### 3. `get_payment_history`

**Purpose**: Get detailed payment history for an agent, including all past payments.

**Parameters**:
- `agent_wallet` (string, required): Wallet address of the agent to check
- `role` (string, optional): Filter by role - "all", "payer", or "payee" (default: "all")
- `page` (number, optional): Page number for pagination (default: 1)
- `page_size` (number, optional): Events per page (default: 50, max: 200)

**Pricing**: $0.001 USD (currently not enforced in demo mode)

**Example Usage**:
```
"Show me the payment history for agent 0xAGENT_BOB_WALLET_002"
"Get the last 10 payments where agent 0xAGENT_BOB_WALLET_002 was the payer"
```

**Returns**:
```json
{
  "agent_id": "0xAGENT_BOB_WALLET_002",
  "total_count": 42,
  "page": 1,
  "page_size": 50,
  "total_pages": 1,
  "payments": [
    {
      "event_id": "evt_abc123xyz",
      "payer_wallet": "0xAGENT_BOB_WALLET_002",
      "payee_wallet": "0xAGENT_ALICE_WALLET_001",
      "amount": "150.00",
      "currency": "USD",
      "due_date": "2025-11-10T00:00:00Z",
      "payment_date": "2025-11-09T15:30:00Z",
      "status": "on_time",
      "days_overdue": 0,
      "reported_at": "2025-11-09T15:31:00Z",
      "reporter_wallet": "0xAGENT_ALICE_WALLET_001"
    }
  ]
}
```

---

### 4. `report_payment`

**Purpose**: Report a payment event to update credit scores. Use this after completing or receiving a payment.

**Parameters**:
- `payer_wallet` (string, required): Wallet address of the party making payment
- `payee_wallet` (string, required): Wallet address of the party receiving payment
- `amount` (string, required): Payment amount (e.g., "150.00")
- `currency` (string, optional): Currency code (default: "USD")
- `due_date` (string, required): ISO 8601 datetime when payment was due
- `payment_date` (string, required for on_time/late): ISO 8601 datetime when payment was made
- `status` (string, required): "on_time", "late", or "defaulted"

**Pricing**: FREE

**Example Usage**:
```
"Report a payment: I (0xAGENT_ALICE_WALLET_001) received $100 from agent 0xAGENT_BOB_WALLET_002.
It was due on 2025-11-10 and paid on 2025-11-09 (on time)"
```

**Returns**:
```json
{
  "event_id": "evt_abc123xyz",
  "message": "Payment event recorded successfully",
  "payer_wallet": "0xAGENT_BOB_WALLET_002",
  "payee_wallet": "0xAGENT_ALICE_WALLET_001",
  "amount": "150.00",
  "status": "on_time",
  "days_overdue": 0,
  "reported_at": "2025-11-15T10:00:00Z",
  "credit_score_updated": true,
  "new_credit_scores": {
    "payer": 87,
    "payee": 72
  }
}
```

---

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Credit Checking Server URL
CREDIT_SERVER_URL=http://localhost:8000

# Agent Wallet Address (identifies this agent)
AGENT_WALLET_ADDRESS=0xYOUR_AGENT_WALLET_ADDRESS_HERE
```

### Starting the Credit Server

Before using these tools, make sure the credit checking server is running:

```bash
cd ../credit_checking_server
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Run from credit_checking_server directory (not from src)
uvicorn src.main:app --reload
```

The server will be available at `http://localhost:8000`.

---

## Usage Examples

### Example 1: Check Creditworthiness Before Accepting Delayed Payment

**User**: "Agent Bob (0xAGENT_BOB_WALLET_002) wants to pay me $500 but requests 30 days delay. Should I accept?"

**Agent**:
1. Uses `get_credit_score` to check Bob's credit score
2. Uses `get_payment_history` to review Bob's past payment behavior
3. Analyzes the data and recommends:
   - If score > 80: "Safe to accept delayed payment"
   - If score 70-80: "Moderate risk, consider shorter delay"
   - If score < 70: "High risk, request immediate payment"

### Example 2: Report a Completed Payment

**User**: "I just received $250 from agent Bob (0xAGENT_BOB_WALLET_002). It was due yesterday but paid today."

**Agent**:
1. Uses `report_payment` with:
   - payer_wallet: 0xAGENT_BOB_WALLET_002
   - payee_wallet: 0xAGENT_ALICE_WALLET_001
   - amount: "250.00"
   - due_date: [yesterday's date]
   - payment_date: [today's date]
   - status: "late"
2. Reports the payment and receives updated credit scores

### Example 3: Review Overall Trustworthiness

**User**: "Give me a full credit report on agent Bob (0xAGENT_BOB_WALLET_002)"

**Agent**:
1. Uses `get_credit_score` to get current score
2. Uses `get_payment_history` to get full payment history
3. Analyzes patterns:
   - Total payments made vs received
   - Percentage of on-time payments
   - Recent payment behavior
   - Any defaults or late payments
4. Provides comprehensive trustworthiness assessment

---

## Payment Status Rules

### `on_time`
- Payment made on or before due date
- Credit score impact: **+0.5 points** (max +30 total)
- Best for building credit

### `late`
- Payment made after due date
- Credit score impact:
  - 1-7 days late: **-2 points**
  - 8-30 days late: **-5 points**
  - >30 days late: **-10 points**
- Still better than defaulting

### `defaulted`
- Payment never made
- Credit score impact: **-15 points**
- Severely damages credit score

---

## X402 Payment Protocol

**Current Status**: Demo mode (payment verification disabled)

In production, the paid endpoints (`get_credit_score` and `get_payment_history`) require X402 payment protocol:

1. Agent makes request without payment
2. Server returns 402 Payment Required with payment details
3. Agent makes payment via Locus
4. Agent retries request with payment proof
5. Server verifies payment and returns data

This is currently disabled for development/testing purposes.

---

## Error Handling

The tools include error handling for common issues:

- **Connection errors**: Credit server unreachable
- **Invalid wallet addresses**: Malformed addresses
- **Payment required**: X402 payment needed (when enabled)
- **Validation errors**: Invalid parameters

Errors are returned to the agent with helpful messages for debugging.

---

## Tool Implementation

Tools are implemented in [tools.ts](tools.ts):

- Tool definitions follow Claude Agent SDK format
- HTTP requests use native `fetch` API
- TypeScript types ensure type safety
- Async/await for clean asynchronous code

---

## Next Steps

1. **Enable X402 Payments**: Integrate Locus SDK for micropayments
2. **Add Agent Personality**: Configure risk tolerance for credit decisions
3. **Build Negotiation Logic**: Automated payment term negotiation
4. **Multi-Agent Communication**: Enable agent-to-agent protocols
5. **Payment Scheduling**: Integrate with Locus for automated payments

---

## Support

For issues or questions:
- Credit Server API: See `/credit_checking_server/API_SPEC.md`
- Locus MCP: See Locus documentation
- Claude Agent SDK: See Anthropic documentation
