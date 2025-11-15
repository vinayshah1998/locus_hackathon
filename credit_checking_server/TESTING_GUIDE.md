# Credit Checking Server - Testing Guide

This guide shows you how to test your Credit Checking Server API.

## Prerequisites

1. **Start the server**:
   ```bash
   cd credit_checking_server/src
   uvicorn main:app --reload
   ```

2. **Configure .env for testing**:
   ```bash
   # For testing without payment verification
   X402_ENABLED=false

   # OR for testing with mock payments
   X402_ENABLED=true
   ENV=development
   ```

   The mock mode accepts any payment proof starting with `test_`, `proof_`, or `mock_`.

## Quick Start - Python Test Script

The easiest way to test is using the included test script:

```bash
# Install dependencies
pip install requests

# Run all tests
python test_api.py

# Run specific test
python test_api.py --test health
python test_api.py --test payment
python test_api.py --test credit
python test_api.py --test algorithm

# Test against different URL
python test_api.py --url http://localhost:8080
```

The test script will:
- ✅ Create test payment events
- ✅ Query credit scores (with mock payments)
- ✅ Query payment history
- ✅ Test validation errors
- ✅ Verify the credit scoring algorithm

## Manual Testing with cURL

### 1. Health Check (Free)

```bash
curl http://localhost:8000/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-15T10:00:00Z",
  "version": "1.0.0"
}
```

---

### 2. Report Payment (Free)

Report an on-time payment:

```bash
curl -X POST http://localhost:8000/report-payment \
  -H "X-Agent-Wallet: 0x1111111111111111111111111111111111111111" \
  -H "Content-Type: application/json" \
  -d '{
    "payer_wallet": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "payee_wallet": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "amount": "100.00",
    "due_date": "2025-11-10T00:00:00Z",
    "payment_date": "2025-11-09T15:30:00Z",
    "status": "on_time"
  }'
```

Report a late payment (10 days):

```bash
curl -X POST http://localhost:8000/report-payment \
  -H "X-Agent-Wallet: 0x1111111111111111111111111111111111111111" \
  -H "Content-Type: application/json" \
  -d '{
    "payer_wallet": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "payee_wallet": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "amount": "150.00",
    "due_date": "2025-11-01T00:00:00Z",
    "payment_date": "2025-11-11T10:00:00Z",
    "status": "late"
  }'
```

Report a defaulted payment:

```bash
curl -X POST http://localhost:8000/report-payment \
  -H "X-Agent-Wallet: 0x1111111111111111111111111111111111111111" \
  -H "Content-Type: application/json" \
  -d '{
    "payer_wallet": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "payee_wallet": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "amount": "200.00",
    "due_date": "2025-10-15T00:00:00Z",
    "status": "defaulted"
  }'
```

**Expected Response:**
```json
{
  "event_id": "evt_abc123xyz",
  "message": "Payment event recorded successfully",
  "payer_wallet": "0xaaaa...",
  "payee_wallet": "0xbbbb...",
  "amount": "100.00",
  "status": "on_time",
  "days_overdue": 0,
  "reported_at": "2025-11-15T10:00:00Z",
  "credit_score_updated": true,
  "new_credit_scores": {
    "payer": 70.5,
    "payee": 70
  }
}
```

---

### 3. Get Credit Score (Paid - $0.002)

**Without payment (will get 402):**

```bash
curl http://localhost:8000/credit-score/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  -H "X-Agent-Wallet: 0x1111111111111111111111111111111111111111"
```

**Expected Response:**
```http
HTTP/1.1 402 Payment Required
X-402-Amount: 0.002
X-402-Currency: USD
X-402-Address: 0xYOUR_SERVER_WALLET
```

**With mock payment (will succeed in dev mode):**

```bash
curl http://localhost:8000/credit-score/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  -H "X-Agent-Wallet: 0x1111111111111111111111111111111111111111" \
  -H "X-402-Payment-Proof: test_proof_abc123" \
  -H "X-402-Amount: 0.002" \
  -H "X-402-Signature: test_signature_xyz"
```

**Expected Response:**
```json
{
  "agent_id": "0xaaaa...",
  "credit_score": 70.5,
  "last_updated": "2025-11-15T10:00:00Z",
  "payments_count": 2,
  "is_new_agent": false
}
```

---

### 4. Get Payment History (Paid - $0.001)

**All payment history:**

```bash
curl "http://localhost:8000/payment-history/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
  -H "X-Agent-Wallet: 0x1111111111111111111111111111111111111111" \
  -H "X-402-Payment-Proof: test_proof_abc123" \
  -H "X-402-Amount: 0.001" \
  -H "X-402-Signature: test_signature_xyz"
```

**Filter by role (as payer only):**

```bash
curl "http://localhost:8000/payment-history/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?role=payer" \
  -H "X-Agent-Wallet: 0x1111111111111111111111111111111111111111" \
  -H "X-402-Payment-Proof: test_proof_abc123" \
  -H "X-402-Amount: 0.001" \
  -H "X-402-Signature: test_signature_xyz"
```

**Filter by status (late payments only):**

```bash
curl "http://localhost:8000/payment-history/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?status=late" \
  -H "X-Agent-Wallet: 0x1111111111111111111111111111111111111111" \
  -H "X-402-Payment-Proof: test_proof_abc123" \
  -H "X-402-Amount: 0.001" \
  -H "X-402-Signature: test_signature_xyz"
```

**Pagination:**

```bash
curl "http://localhost:8000/payment-history/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?page=2&page_size=10" \
  -H "X-Agent-Wallet: 0x1111111111111111111111111111111111111111" \
  -H "X-402-Payment-Proof: test_proof_abc123" \
  -H "X-402-Amount: 0.001" \
  -H "X-402-Signature: test_signature_xyz"
```

**Expected Response:**
```json
{
  "agent_id": "0xaaaa...",
  "total_count": 5,
  "page": 1,
  "page_size": 50,
  "total_pages": 1,
  "payments": [
    {
      "event_id": "evt_abc123",
      "payer_wallet": "0xaaaa...",
      "payee_wallet": "0xbbbb...",
      "amount": "100.00",
      "currency": "USD",
      "due_date": "2025-11-10T00:00:00Z",
      "payment_date": "2025-11-09T15:30:00Z",
      "status": "on_time",
      "days_overdue": 0,
      "reported_at": "2025-11-09T15:31:00Z",
      "reporter_wallet": "0x1111..."
    }
  ]
}
```

---

## Testing Scenarios

### Scenario 1: Building Good Credit

```bash
# Agent starts with default score of 70
# Report 10 on-time payments (each adds +0.5)
# Expected final score: 75

for i in {1..10}; do
  curl -X POST http://localhost:8000/report-payment \
    -H "X-Agent-Wallet: 0x9999999999999999999999999999999999999999" \
    -H "Content-Type: application/json" \
    -d "{
      \"payer_wallet\": \"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",
      \"payee_wallet\": \"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",
      \"amount\": \"100.00\",
      \"due_date\": \"2025-11-10T00:00:00Z\",
      \"payment_date\": \"2025-11-09T15:30:00Z\",
      \"status\": \"on_time\"
    }"
  sleep 0.5
done

# Check final score
curl http://localhost:8000/credit-score/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  -H "X-Agent-Wallet: 0x9999999999999999999999999999999999999999" \
  -H "X-402-Payment-Proof: test_proof" \
  -H "X-402-Amount: 0.002" \
  -H "X-402-Signature: test_sig"
```

### Scenario 2: Damaging Credit with Late Payments

```bash
# Report a late payment (5 days, -2 points)
curl -X POST http://localhost:8000/report-payment \
  -H "X-Agent-Wallet: 0x9999999999999999999999999999999999999999" \
  -H "Content-Type: application/json" \
  -d '{
    "payer_wallet": "0xcccccccccccccccccccccccccccccccccccccccc",
    "payee_wallet": "0xdddddddddddddddddddddddddddddddddddddddd",
    "amount": "100.00",
    "due_date": "2025-11-05T00:00:00Z",
    "payment_date": "2025-11-10T00:00:00Z",
    "status": "late"
  }'

# Report a very late payment (35 days, -10 points)
curl -X POST http://localhost:8000/report-payment \
  -H "X-Agent-Wallet: 0x9999999999999999999999999999999999999999" \
  -H "Content-Type: application/json" \
  -d '{
    "payer_wallet": "0xcccccccccccccccccccccccccccccccccccccccc",
    "payee_wallet": "0xdddddddddddddddddddddddddddddddddddddddd",
    "amount": "150.00",
    "due_date": "2025-10-01T00:00:00Z",
    "payment_date": "2025-11-05T00:00:00Z",
    "status": "late"
  }'

# Report a default (-15 points)
curl -X POST http://localhost:8000/report-payment \
  -H "X-Agent-Wallet: 0x9999999999999999999999999999999999999999" \
  -H "Content-Type: application/json" \
  -d '{
    "payer_wallet": "0xcccccccccccccccccccccccccccccccccccccccc",
    "payee_wallet": "0xdddddddddddddddddddddddddddddddddddddddd",
    "amount": "200.00",
    "due_date": "2025-09-01T00:00:00Z",
    "status": "defaulted"
  }'

# Check score (should be significantly lower)
curl http://localhost:8000/credit-score/0xcccccccccccccccccccccccccccccccccccccccc \
  -H "X-Agent-Wallet: 0x9999999999999999999999999999999999999999" \
  -H "X-402-Payment-Proof: test_proof" \
  -H "X-402-Amount: 0.002" \
  -H "X-402-Signature: test_sig"
```

### Scenario 3: Testing Validation Errors

```bash
# Invalid wallet format
curl http://localhost:8000/credit-score/invalid_address \
  -H "X-Agent-Wallet: 0x1111111111111111111111111111111111111111"

# Missing wallet header
curl http://localhost:8000/credit-score/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

# Same payer and payee
curl -X POST http://localhost:8000/report-payment \
  -H "X-Agent-Wallet: 0x9999999999999999999999999999999999999999" \
  -H "Content-Type: application/json" \
  -d '{
    "payer_wallet": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "payee_wallet": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "amount": "100.00",
    "due_date": "2025-11-10T00:00:00Z",
    "payment_date": "2025-11-09T15:30:00Z",
    "status": "on_time"
  }'

# Negative amount
curl -X POST http://localhost:8000/report-payment \
  -H "X-Agent-Wallet: 0x9999999999999999999999999999999999999999" \
  -H "Content-Type: application/json" \
  -d '{
    "payer_wallet": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "payee_wallet": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "amount": "-100.00",
    "due_date": "2025-11-10T00:00:00Z",
    "payment_date": "2025-11-09T15:30:00Z",
    "status": "on_time"
  }'
```

---

## Testing with Python requests

Create a simple test script:

```python
import requests

BASE_URL = "http://localhost:8000"

# 1. Check health
response = requests.get(f"{BASE_URL}/health")
print(f"Health: {response.json()}")

# 2. Report a payment
response = requests.post(
    f"{BASE_URL}/report-payment",
    headers={"X-Agent-Wallet": "0x1111111111111111111111111111111111111111"},
    json={
        "payer_wallet": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "payee_wallet": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "amount": "100.00",
        "due_date": "2025-11-10T00:00:00Z",
        "payment_date": "2025-11-09T12:00:00Z",
        "status": "on_time"
    }
)
print(f"Payment reported: {response.json()}")

# 3. Get credit score (with mock payment)
response = requests.get(
    f"{BASE_URL}/credit-score/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    headers={
        "X-Agent-Wallet": "0x1111111111111111111111111111111111111111",
        "X-402-Payment-Proof": "test_proof",
        "X-402-Amount": "0.002",
        "X-402-Signature": "test_sig"
    }
)
print(f"Credit score: {response.json()}")

# 4. Get payment history (with mock payment)
response = requests.get(
    f"{BASE_URL}/payment-history/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    headers={
        "X-Agent-Wallet": "0x1111111111111111111111111111111111111111",
        "X-402-Payment-Proof": "test_proof",
        "X-402-Amount": "0.001",
        "X-402-Signature": "test_sig"
    }
)
print(f"Payment history: {response.json()}")
```

---

## Using Postman

1. Import OpenAPI schema from: `http://localhost:8000/openapi.json`
2. Create environment variables:
   - `base_url`: `http://localhost:8000`
   - `test_wallet`: `0x1111111111111111111111111111111111111111`
   - `test_payment_proof`: `test_proof_abc123`

3. For paid endpoints, add headers:
   - `X-Agent-Wallet`: `{{test_wallet}}`
   - `X-402-Payment-Proof`: `{{test_payment_proof}}`
   - `X-402-Amount`: `0.002` (for credit score) or `0.001` (for payment history)
   - `X-402-Signature`: `test_signature_xyz`

---

## Interactive API Documentation

FastAPI provides interactive documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

You can test all endpoints directly from the Swagger UI!

---

## Credit Scoring Algorithm Reference

Starting score: **70**

| Event | Score Change | Example |
|-------|-------------|---------|
| On-time payment | **+0.5** (max +30) | 70 → 70.5 |
| Late 1-7 days | **-2** | 70 → 68 |
| Late 8-30 days | **-5** | 70 → 65 |
| Late >30 days | **-10** | 70 → 60 |
| Default | **-15** | 70 → 55 |

Final score is clamped to [0-100].

---

## Troubleshooting

### Server not responding

```bash
# Check if server is running
curl http://localhost:8000/health

# Check server logs
cd credit_checking_server/src
uvicorn main:app --reload
```

### MongoDB connection issues

```bash
# Check MongoDB is running
mongosh mongodb://localhost:27017

# Or check with Python
python -c "from pymongo import MongoClient; client = MongoClient('mongodb://localhost:27017'); print('Connected!')"
```

### Always getting 402 errors

Check your `.env` file:
```bash
# Disable x402 for testing
X402_ENABLED=false

# OR enable mock mode
X402_ENABLED=true
ENV=development
```

Restart server after changing `.env`.

### Payment headers not working

Make sure you're using the correct prefixes in dev mode:
- ✅ `test_proof_abc123`
- ✅ `proof_12345`
- ✅ `mock_payment_xyz`
- ❌ `payment_abc123` (wrong prefix)

---

## Next Steps

After validating the API:

1. **Test with real agents**: Implement the payment agent that uses these APIs
2. **Production x402**: Replace mock verification with real Locus API integration
3. **Load testing**: Test with many concurrent requests
4. **Security**: Add rate limiting, authentication tokens
5. **Monitoring**: Add metrics and alerting

---

## Quick Reference

| Endpoint | Method | Free? | Purpose |
|----------|--------|-------|---------|
| `/health` | GET | ✅ | Check server health |
| `/` | GET | ✅ | API information |
| `/report-payment` | POST | ✅ | Report payment events |
| `/credit-score/{agent_id}` | GET | ❌ ($0.002) | Query credit score |
| `/payment-history/{agent_id}` | GET | ❌ ($0.001) | Query payment history |

**Required Headers:**
- All endpoints: `X-Agent-Wallet: <wallet_address>`
- Paid endpoints (dev mode): `X-402-Payment-Proof: test_<something>`
- Paid endpoints (dev mode): `X-402-Amount: <amount>`
- Paid endpoints (dev mode): `X-402-Signature: test_<something>`
