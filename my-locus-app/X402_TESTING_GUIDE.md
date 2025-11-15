# X402 Payment Integration - Testing Guide

## Overview
This guide explains how to test the x402 payment flow between your agent and the credit checking server.

## What Changed

### 1. Credit Checking Tools ([tools.ts](tools.ts))
- **`get_credit_score`**: Added payment proof parameters, returns structured 402 responses
- **`get_payment_history`**: Added payment proof parameters, returns structured 402 responses
- Both tools now include x402 headers when payment proof is provided

### 2. Agent System Prompt ([index.ts](index.ts))
- Added comprehensive x402 protocol instructions
- Explains the payment flow step-by-step
- Includes example conversation flow

## Testing Modes

### Mode 1: Bypass Payment Verification (Quickest)
Test the flow without actual payments.

**Credit Server Setup:**
```bash
cd credit_checking_server
# Edit .env file
X402_ENABLED=false

# Start server
uvicorn src.main:app --reload
```

**Expected Behavior:**
- Agent calls credit checking tools
- Server returns data immediately (no 402)
- No payments made

**Use Case:** Test basic integration, verify data flow

### Mode 2: Mock Payment Proofs (Recommended)
Test the complete x402 flow with mock payments.

**Credit Server Setup:**
```bash
cd credit_checking_server
# Edit .env file
X402_ENABLED=true
ENV=development  # Enables mock payment acceptance

# Start server
uvicorn src.main:app --reload
```

**Agent Setup:**
For testing without actual Locus calls, you can manually test by:

1. Call get_credit_score without payment → get 402 response
2. Note the payment address and amount
3. Call get_credit_score again with mock payment proof:
   - payment_proof: "test_mock_transaction_123"
   - payment_amount: "0.002"
   - payment_signature: "mock_signature_456"

**Expected Behavior:**
- Agent receives 402 with payment instructions
- Agent "makes payment" (simulated)
- Agent retries with mock proof
- Server accepts mock proof (starts with "test_", "proof_", or "mock_")
- Server returns actual data

**Use Case:** Test complete x402 flow without real money

### Mode 3: Real Locus Payments (Production)
Test with actual USDC payments via Locus.

**Prerequisites:**
- Locus wallet with USDC balance
- Valid LOCUS_API_KEY
- Credit server wallet address configured

**Credit Server Setup:**
```bash
cd credit_checking_server
# Edit .env file
X402_ENABLED=true
ENV=production
LOCUS_WALLET_ADDRESS=0xYourServerWalletAddress
LOCUS_API_KEY=your_locus_api_key

# Start server
uvicorn src.main:app --reload
```

**Agent Setup:**
```bash
cd my-locus-app
# Edit .env file
LOCUS_API_KEY=your_locus_api_key
AGENT_WALLET_ADDRESS=0xYourAgentWalletAddress

# Start agent
npm run start
```

**Expected Behavior:**
1. Agent calls credit checking tool → 402 response
2. Agent calls `mcp__locus__send_to_address` with payment details
3. Locus processes payment, returns transaction hash/signature
4. Agent retries credit check with payment proof
5. Server verifies payment with Locus API
6. Server returns actual data

**Use Case:** Production testing, real payments

## Test Scenarios

### Scenario 1: Check Credit Score
```
User: Check the credit score for 0xTEST123

Expected Flow:
1. Agent calls get_credit_score(agent_wallet="0xTEST123")
2. Agent receives 402 payment required
3. Agent calls send_to_address (or uses mock)
4. Agent retries get_credit_score with payment proof
5. Agent receives credit score data
```

### Scenario 2: View Payment History
```
User: Show me the payment history for 0xTEST456

Expected Flow:
1. Agent calls get_payment_history(agent_wallet="0xTEST456")
2. Agent receives 402 payment required ($0.001)
3. Agent makes payment
4. Agent retries with proof
5. Agent receives payment history
```

### Scenario 3: Free Report Payment
```
User: Report a payment from 0xAAA to 0xBBB

Expected Flow:
1. Agent calls report_payment with details
2. No payment required (free endpoint)
3. Payment event recorded successfully
```

## Testing Commands

### Start Credit Server
```bash
cd credit_checking_server
source venv/bin/activate  # If using virtual environment
uvicorn src.main:app --reload
```

### Start Agent
```bash
cd my-locus-app
npm run start
```

### Check Server Health
```bash
curl http://localhost:8000/health
```

### Manual API Test (with Mock Payment)
```bash
# Try without payment (should get 402)
curl -H "X-Agent-Wallet: 0xTEST" \
     http://localhost:8000/credit-score/0xAGENT123

# Try with mock payment (should succeed in dev mode)
curl -H "X-Agent-Wallet: 0xTEST" \
     -H "X-402-Payment-Proof: test_mock_transaction" \
     -H "X-402-Amount: 0.002" \
     -H "X-402-Signature: mock_sig_123" \
     http://localhost:8000/credit-score/0xAGENT123
```

## Troubleshooting

### Issue: "Payment required but no Locus tools available"
**Solution:** Ensure Locus MCP is configured in index.ts:
```typescript
mcpServers: {
  'locus': {
    type: 'http',
    url: 'https://mcp.paywithlocus.com/mcp',
    headers: {
      'Authorization': `Bearer ${process.env.LOCUS_API_KEY}`
    }
  }
}
```

### Issue: "Invalid payment proof"
**Solutions:**
- **Dev mode:** Use proof starting with "test_", "proof_", or "mock_"
- **Prod mode:** Ensure Locus returned valid transaction hash
- Check server logs for verification details

### Issue: Agent doesn't recognize 402 response
**Solution:** The agent should see "❌ Payment Required" in the tool response. Check:
- Tool is returning correct format
- System prompt includes x402 instructions
- Agent is parsing tool responses correctly

### Issue: Locus payment fails
**Solutions:**
- Check wallet balance (need USDC)
- Verify LOCUS_API_KEY is valid
- Check network connectivity
- Verify recipient address is correct

## Expected Locus Response Format

When the agent calls `mcp__locus__send_to_address`, it should receive a response like:
```json
{
  "status": "success",
  "transaction_hash": "0x...",
  "signature": "0x...",
  "amount": "0.002",
  "recipient": "0x...",
  ...
}
```

**Note:** The exact field names may vary. The agent needs to:
1. Extract transaction identifier → use as `payment_proof`
2. Extract signature → use as `payment_signature`
3. Use the same amount → `payment_amount`

If the field names differ, update the system prompt in index.ts accordingly.

## Next Steps

1. **Start Testing:** Begin with Mode 1 (bypass) to verify basic flow
2. **Test Mock Payments:** Move to Mode 2 to test complete x402 flow
3. **Real Payments:** Once confident, test Mode 3 with actual USDC
4. **Refine:** Based on Locus response format, update system prompt if needed
5. **Document:** Record any edge cases or issues discovered

## Server Configuration Reference

### Credit Server (.env)
```bash
X402_ENABLED=true/false          # Enable x402 payment verification
ENV=development/production        # Dev accepts mock proofs
LOCUS_WALLET_ADDRESS=0x...       # Server's payment recipient address
LOCUS_API_KEY=...                # For payment verification
CREDIT_SCORE_PRICE=0.002         # Price for credit score endpoint
PAYMENT_HISTORY_PRICE=0.001      # Price for payment history endpoint
```

### Agent (.env)
```bash
LOCUS_API_KEY=...                # Your Locus API key
AGENT_WALLET_ADDRESS=0x...       # Agent's wallet address
CREDIT_SERVER_URL=http://localhost:8000
```

## Success Criteria

- [ ] Agent receives 402 response with payment details
- [ ] Agent recognizes payment requirement
- [ ] Agent calls Locus payment tool (or uses mock)
- [ ] Agent retries with payment proof headers
- [ ] Server verifies payment successfully
- [ ] Agent receives actual data
- [ ] Agent informs user of payment made
- [ ] Total cost is tracked and reported

## Questions or Issues?

If you encounter issues:
1. Check server logs: Look for payment verification messages
2. Check agent logs: Verify tool calls and responses
3. Test manually: Use curl to test server endpoints
4. Verify configuration: Double-check .env files
5. Review x402_handler.py: Check payment verification logic
