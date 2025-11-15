# Debug Mode - Disabling X402 Payments

## Overview

The Credit Checking Server supports a debug mode that disables x402 payment verification, allowing you to test all API endpoints without needing to make actual payments. This is useful for:

- Local development and testing
- Integration testing
- Demo purposes
- Debugging agent interactions

## How to Enable Debug Mode

### Option 1: Environment Variable (Recommended)

Set `X402_ENABLED=false` in your `.env` file:

```bash
# In your .env file
X402_ENABLED=false
```

### Option 2: Command Line Flag

You can also set it when starting the server:

```bash
# Using environment variable inline
X402_ENABLED=false uvicorn src.main:app --reload

# Or export it first
export X402_ENABLED=false
uvicorn src.main:app --reload
```

### Option 3: System Environment Variable

```bash
# Bash/Zsh
export X402_ENABLED=false

# Fish
set -x X402_ENABLED false

# Windows CMD
set X402_ENABLED=false

# Windows PowerShell
$env:X402_ENABLED="false"
```

## How to Verify Debug Mode is Active

When you start the server with debug mode enabled, you'll see this warning in the logs:

```
⚠️  X402 PAYMENT VERIFICATION DISABLED - DEBUG MODE ACTIVE ⚠️
```

You can also check the root endpoint to confirm:

```bash
curl http://localhost:8000/
```

Response will include:
```json
{
  "service": "Credit Checking Server",
  "x402_enabled": false,
  "debug_mode": true,
  "pricing": {
    "credit_score": "FREE (debug mode)",
    "payment_history": "FREE (debug mode)",
    "report_payment": "Free"
  }
}
```

## Testing Endpoints in Debug Mode

### Get Credit Score (normally $0.002)

```bash
# No payment headers needed!
curl -H "X-Agent-Wallet: 0x123abc" \
     http://localhost:8000/credit-score/0x456def
```

### Get Payment History (normally $0.001)

```bash
# No payment headers needed!
curl -H "X-Agent-Wallet: 0x123abc" \
     http://localhost:8000/payment-history/0x456def
```

### Report Payment (always free)

```bash
curl -X POST http://localhost:8000/report-payment \
     -H "Content-Type: application/json" \
     -H "X-Agent-Wallet: 0x123abc" \
     -d '{
       "payer_wallet": "0x123abc",
       "payee_wallet": "0x456def",
       "amount": 100.00,
       "currency": "USD",
       "due_date": "2025-11-15T00:00:00Z",
       "payment_date": "2025-11-14T00:00:00Z",
       "status": "on_time"
     }'
```

## Quick Start for Development

1. **Copy the example environment file:**
   ```bash
   cd credit_checking_server
   cp .env.example .env
   ```

2. **Edit `.env` and set debug mode:**
   ```bash
   X402_ENABLED=false
   ```

3. **Start the server:**
   ```bash
   uvicorn src.main:app --reload
   ```

4. **Test that debug mode is active:**
   ```bash
   # Check server info
   curl http://localhost:8000/

   # Try accessing a paid endpoint without payment
   curl -H "X-Agent-Wallet: 0xtest" \
        http://localhost:8000/credit-score/0xtest
   ```

## Re-enabling X402 Payments

To switch back to production mode with payment verification:

1. Set `X402_ENABLED=true` in your `.env` file
2. Restart the server
3. Verify the startup logs show: `"x402_payment_verification_enabled"`

## Important Notes

- **Never deploy to production with debug mode enabled** - this would allow free access to paid endpoints
- The server will log when debug mode is active to prevent accidental deployment
- You still need to provide the `X-Agent-Wallet` header even in debug mode (for agent identification)
- The `report-payment` endpoint is always free, regardless of debug mode

## Troubleshooting

### Debug mode doesn't seem to work

1. Check your `.env` file is in the correct location (`credit_checking_server/.env`)
2. Verify the variable is spelled correctly: `X402_ENABLED=false`
3. Restart the server completely
4. Check the startup logs for the warning message

### Still getting 402 Payment Required errors

1. Make sure you're setting the environment variable correctly
2. Try setting it inline: `X402_ENABLED=false uvicorn src.main:app --reload`
3. Check that no other `.env` file is overriding your settings

### Want to test with payments

If you want to test the payment flow with mock payments while `X402_ENABLED=true`:

In development mode (`ENV=development`), the server accepts mock payment proofs that start with:
- `test_`
- `proof_`
- `mock_`

Example:
```bash
curl -H "X-Agent-Wallet: 0x123abc" \
     -H "X-402-Payment-Proof: test_payment_12345" \
     -H "X-402-Amount: 0.002" \
     -H "X-402-Signature: mock_signature" \
     http://localhost:8000/credit-score/0x456def
```

## Summary

| Configuration | Paid Endpoints | Use Case |
|--------------|----------------|----------|
| `X402_ENABLED=false` | Free access | Development, testing, debugging |
| `X402_ENABLED=true` + `ENV=development` | Mock payments accepted | Testing payment flow |
| `X402_ENABLED=true` + `ENV=production` | Real payments required | Production deployment |
