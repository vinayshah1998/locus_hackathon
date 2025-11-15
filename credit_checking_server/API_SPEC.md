# Credit Checking Server - API Specification

## Base URL
```
Local Development: http://localhost:8000
```

## Authentication
Agents are identified by their wallet addresses. The wallet address should be included in request headers:
```
X-Agent-Wallet: <wallet_address>
```

## X402 Payment Protocol

For paid endpoints, clients must include x402 payment proof in request headers:
```
X-402-Payment-Proof: <payment_proof_string>
X-402-Amount: <payment_amount>
X-402-Signature: <signature>
```

If payment is missing or invalid, the server returns:
```
HTTP/1.1 402 Payment Required
X-402-Amount: <required_amount>
X-402-Currency: USD
X-402-Address: <server_wallet_address>
```

## API Pricing

| Endpoint | Price (USD) | Payment Required |
|----------|-------------|------------------|
| `GET /credit-score/{agent_id}` | $0.002 | Yes |
| `GET /payment-history/{agent_id}` | $0.001 | Yes |
| `POST /report-payment` | Free | No |

---

## Endpoints

### 1. Health Check

Check if the server is running and healthy.

#### Request
```http
GET /health
```

#### Response
```json
{
  "status": "healthy",
  "timestamp": "2025-11-15T10:00:00Z",
  "version": "1.0.0"
}
```

**Status Codes:**
- `200 OK`: Server is healthy

---

### 2. Get Credit Score

Retrieve the credit score for a specific agent.

#### Request
```http
GET /credit-score/{agent_id}
```

**Headers:**
```
X-Agent-Wallet: <requester_wallet_address>
X-402-Payment-Proof: <payment_proof>
X-402-Amount: 0.002
X-402-Signature: <signature>
```

**Path Parameters:**
- `agent_id` (string, required): Wallet address of the agent to query

**Query Parameters:**
- None

#### Response - Success
```json
{
  "agent_id": "0x1234567890abcdef",
  "credit_score": 85,
  "last_updated": "2025-11-15T09:30:00Z",
  "payments_count": 42,
  "is_new_agent": false
}
```

**Response Fields:**
- `agent_id`: Wallet address of the agent
- `credit_score`: Credit score (0-100)
- `last_updated`: Timestamp of last score calculation
- `payments_count`: Total number of payment events recorded
- `is_new_agent`: True if agent has no payment history (default score)

**Status Codes:**
- `200 OK`: Credit score retrieved successfully
- `402 Payment Required`: Payment missing or invalid
- `404 Not Found`: Agent not found (returns default score of 70)
- `400 Bad Request`: Invalid wallet address format

#### Response - Payment Required (402)
```http
HTTP/1.1 402 Payment Required
X-402-Amount: 0.002
X-402-Currency: USD
X-402-Address: 0xSERVER_WALLET_ADDRESS
```

```json
{
  "error": "payment_required",
  "message": "Payment of $0.002 USD required to access this endpoint",
  "payment_details": {
    "amount": "0.002",
    "currency": "USD",
    "payment_address": "0xSERVER_WALLET_ADDRESS",
    "endpoint": "/credit-score/0x1234567890abcdef"
  },
  "instructions": "Include valid x402 payment proof in request headers",
  "timestamp": "2025-11-15T10:00:00Z"
}
```

#### Response - Agent Not Found (Returns Default)
```json
{
  "agent_id": "0x1234567890abcdef",
  "credit_score": 70,
  "last_updated": "2025-11-15T10:00:00Z",
  "payments_count": 0,
  "is_new_agent": true
}
```

#### Example Request (cURL)
```bash
curl -X GET "http://localhost:8000/credit-score/0x1234567890abcdef" \
  -H "X-Agent-Wallet: 0xREQUESTER_WALLET" \
  -H "X-402-Payment-Proof: proof_abc123" \
  -H "X-402-Amount: 0.002" \
  -H "X-402-Signature: sig_xyz789"
```

#### Example Request (Python)
```python
import requests

headers = {
    "X-Agent-Wallet": "0xREQUESTER_WALLET",
    "X-402-Payment-Proof": "proof_abc123",
    "X-402-Amount": "0.002",
    "X-402-Signature": "sig_xyz789"
}

response = requests.get(
    "http://localhost:8000/credit-score/0x1234567890abcdef",
    headers=headers
)
print(response.json())
```

---

### 3. Get Payment History

Retrieve the complete payment history for a specific agent.

#### Request
```http
GET /payment-history/{agent_id}?page=1&page_size=50&role=all
```

**Headers:**
```
X-Agent-Wallet: <requester_wallet_address>
X-402-Payment-Proof: <payment_proof>
X-402-Amount: 0.001
X-402-Signature: <signature>
```

**Path Parameters:**
- `agent_id` (string, required): Wallet address of the agent to query

**Query Parameters:**
- `page` (integer, optional, default=1): Page number for pagination
- `page_size` (integer, optional, default=50, max=200): Number of events per page
- `role` (string, optional, default="all"): Filter by role
  - `all`: Both payer and payee events
  - `payer`: Only events where agent was the payer
  - `payee`: Only events where agent was the payee
- `status` (string, optional): Filter by payment status
  - `on_time`, `late`, `defaulted`

#### Response - Success
```json
{
  "agent_id": "0x1234567890abcdef",
  "total_count": 42,
  "page": 1,
  "page_size": 50,
  "total_pages": 1,
  "payments": [
    {
      "event_id": "evt_abc123xyz",
      "payer_wallet": "0x1234567890abcdef",
      "payee_wallet": "0xfedcba0987654321",
      "amount": "150.00",
      "currency": "USD",
      "due_date": "2025-11-10T00:00:00Z",
      "payment_date": "2025-11-09T15:30:00Z",
      "status": "on_time",
      "days_overdue": 0,
      "reported_at": "2025-11-09T15:31:00Z",
      "reporter_wallet": "0xfedcba0987654321"
    },
    {
      "event_id": "evt_def456uvw",
      "payer_wallet": "0xfedcba0987654321",
      "payee_wallet": "0x1234567890abcdef",
      "amount": "75.50",
      "currency": "USD",
      "due_date": "2025-11-01T00:00:00Z",
      "payment_date": "2025-11-08T10:00:00Z",
      "status": "late",
      "days_overdue": 7,
      "reported_at": "2025-11-08T10:05:00Z",
      "reporter_wallet": "0x1234567890abcdef"
    }
  ]
}
```

**Response Fields:**
- `agent_id`: Wallet address of the agent
- `total_count`: Total number of payment events (across all pages)
- `page`: Current page number
- `page_size`: Number of events per page
- `total_pages`: Total number of pages
- `payments`: Array of payment events (sorted by reported_at, newest first)

**Payment Event Fields:**
- `event_id`: Unique identifier for the payment event
- `payer_wallet`: Wallet address of the party making payment
- `payee_wallet`: Wallet address of the party receiving payment
- `amount`: Payment amount (decimal string)
- `currency`: Currency code (USD)
- `due_date`: When payment was due
- `payment_date`: When payment was actually made (null if defaulted)
- `status`: `on_time`, `late`, or `defaulted`
- `days_overdue`: Number of days late (0 if on time)
- `reported_at`: When this event was reported to the server
- `reporter_wallet`: Wallet address of agent who reported the event

**Status Codes:**
- `200 OK`: Payment history retrieved successfully
- `402 Payment Required`: Payment missing or invalid
- `404 Not Found`: Agent not found (returns empty history)
- `400 Bad Request`: Invalid parameters

#### Response - Payment Required (402)
```json
{
  "error": "payment_required",
  "message": "Payment of $0.001 USD required to access this endpoint",
  "payment_details": {
    "amount": "0.001",
    "currency": "USD",
    "payment_address": "0xSERVER_WALLET_ADDRESS",
    "endpoint": "/payment-history/0x1234567890abcdef"
  },
  "instructions": "Include valid x402 payment proof in request headers",
  "timestamp": "2025-11-15T10:00:00Z"
}
```

#### Response - Agent Not Found
```json
{
  "agent_id": "0x1234567890abcdef",
  "total_count": 0,
  "page": 1,
  "page_size": 50,
  "total_pages": 0,
  "payments": []
}
```

#### Example Request (cURL)
```bash
curl -X GET "http://localhost:8000/payment-history/0x1234567890abcdef?page=1&page_size=50&role=all" \
  -H "X-Agent-Wallet: 0xREQUESTER_WALLET" \
  -H "X-402-Payment-Proof: proof_abc123" \
  -H "X-402-Amount: 0.001" \
  -H "X-402-Signature: sig_xyz789"
```

#### Example Request (Python)
```python
import requests

headers = {
    "X-Agent-Wallet": "0xREQUESTER_WALLET",
    "X-402-Payment-Proof": "proof_abc123",
    "X-402-Amount": "0.001",
    "X-402-Signature": "sig_xyz789"
}

params = {
    "page": 1,
    "page_size": 50,
    "role": "payer"
}

response = requests.get(
    "http://localhost:8000/payment-history/0x1234567890abcdef",
    headers=headers,
    params=params
)
print(response.json())
```

---

### 4. Report Payment

Report a payment event to update credit history. This endpoint is free and does not require x402 payment.

#### Request
```http
POST /report-payment
```

**Headers:**
```
X-Agent-Wallet: <reporter_wallet_address>
Content-Type: application/json
```

**Request Body:**
```json
{
  "payer_wallet": "0x1234567890abcdef",
  "payee_wallet": "0xfedcba0987654321",
  "amount": "150.00",
  "currency": "USD",
  "due_date": "2025-11-10T00:00:00Z",
  "payment_date": "2025-11-09T15:30:00Z",
  "status": "on_time"
}
```

**Request Body Fields:**
- `payer_wallet` (string, required): Wallet address of the payer
- `payee_wallet` (string, required): Wallet address of the payee
- `amount` (string or number, required): Payment amount (decimal)
- `currency` (string, optional, default="USD"): Currency code
- `due_date` (string, required): ISO 8601 datetime when payment was due
- `payment_date` (string, optional): ISO 8601 datetime when payment was made
  - Required if status is `on_time` or `late`
  - Omit if status is `defaulted`
- `status` (string, required): Payment status
  - `on_time`: Payment made on or before due date
  - `late`: Payment made after due date
  - `defaulted`: Payment never made

**Validation Rules:**
- `payer_wallet` and `payee_wallet` must be valid wallet addresses
- `payer_wallet` and `payee_wallet` must be different
- `amount` must be positive
- `due_date` must be a valid ISO 8601 datetime
- If `status` is `on_time`: `payment_date` <= `due_date`
- If `status` is `late`: `payment_date` > `due_date`
- If `status` is `defaulted`: `payment_date` should be null/omitted

#### Response - Success
```json
{
  "event_id": "evt_abc123xyz",
  "message": "Payment event recorded successfully",
  "payer_wallet": "0x1234567890abcdef",
  "payee_wallet": "0xfedcba0987654321",
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

**Response Fields:**
- `event_id`: Unique identifier assigned to this event
- `message`: Confirmation message
- `payer_wallet`: Wallet address of the payer
- `payee_wallet`: Wallet address of the payee
- `amount`: Payment amount
- `status`: Payment status
- `days_overdue`: Calculated days overdue
- `reported_at`: Server timestamp when event was recorded
- `credit_score_updated`: Whether credit scores were recalculated
- `new_credit_scores`: Updated credit scores for both parties

**Status Codes:**
- `201 Created`: Payment event recorded successfully
- `400 Bad Request`: Invalid request data
- `409 Conflict`: Duplicate event (idempotency check)
- `401 Unauthorized`: Invalid or missing wallet address in header

#### Response - Validation Error (400)
```json
{
  "error": "validation_error",
  "message": "Invalid request data",
  "details": {
    "payment_date": "Payment date must be after due date for late status",
    "payer_wallet": "Invalid wallet address format"
  },
  "timestamp": "2025-11-15T10:00:00Z"
}
```

#### Response - Duplicate Event (409)
```json
{
  "error": "duplicate_event",
  "message": "Payment event already reported",
  "existing_event_id": "evt_abc123xyz",
  "timestamp": "2025-11-15T10:00:00Z"
}
```

#### Example Request (cURL)
```bash
curl -X POST "http://localhost:8000/report-payment" \
  -H "X-Agent-Wallet: 0xREPORTER_WALLET" \
  -H "Content-Type: application/json" \
  -d '{
    "payer_wallet": "0x1234567890abcdef",
    "payee_wallet": "0xfedcba0987654321",
    "amount": "150.00",
    "due_date": "2025-11-10T00:00:00Z",
    "payment_date": "2025-11-09T15:30:00Z",
    "status": "on_time"
  }'
```

#### Example Request (Python)
```python
import requests
from datetime import datetime

headers = {
    "X-Agent-Wallet": "0xREPORTER_WALLET",
    "Content-Type": "application/json"
}

payload = {
    "payer_wallet": "0x1234567890abcdef",
    "payee_wallet": "0xfedcba0987654321",
    "amount": "150.00",
    "due_date": "2025-11-10T00:00:00Z",
    "payment_date": "2025-11-09T15:30:00Z",
    "status": "on_time"
}

response = requests.post(
    "http://localhost:8000/report-payment",
    headers=headers,
    json=payload
)
print(response.json())
```

#### Example - Reporting a Default
```json
{
  "payer_wallet": "0x1234567890abcdef",
  "payee_wallet": "0xfedcba0987654321",
  "amount": "200.00",
  "due_date": "2025-11-01T00:00:00Z",
  "status": "defaulted"
}
```
Note: No `payment_date` field when status is `defaulted`.

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "error_code",
  "message": "Human-readable error message",
  "details": {
    "field_name": "Specific error details"
  },
  "timestamp": "2025-11-15T10:00:00Z"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `payment_required` | 402 | X402 payment missing or invalid |
| `validation_error` | 400 | Request data validation failed |
| `invalid_wallet` | 400 | Invalid wallet address format |
| `duplicate_event` | 409 | Payment event already reported |
| `agent_not_found` | 404 | Agent does not exist |
| `unauthorized` | 401 | Missing or invalid authentication |
| `internal_error` | 500 | Server error |

---

## Rate Limiting

**Not Implemented in v1.0**

Future versions will implement rate limiting:
- 100 requests per minute per wallet address
- 429 Too Many Requests response when exceeded

---

## Pagination

Endpoints that return lists support pagination:

**Query Parameters:**
- `page`: Page number (1-indexed, default=1)
- `page_size`: Items per page (default=50, max=200)

**Response includes:**
```json
{
  "total_count": 500,
  "page": 2,
  "page_size": 50,
  "total_pages": 10,
  "items": [...]
}
```

---

## OpenAPI Documentation

Interactive API documentation is available at:
```
http://localhost:8000/docs        # Swagger UI
http://localhost:8000/redoc       # ReDoc
http://localhost:8000/openapi.json # OpenAPI schema
```

---

## Idempotency

### Report Payment Endpoint
To prevent duplicate payment reports, the server implements idempotency:
- Generate a deterministic `event_id` from: `hash(payer_wallet + payee_wallet + amount + due_date)`
- Check if `event_id` already exists before creating
- Return 409 Conflict if duplicate detected

**Client Implementation:**
```python
import hashlib
import json

def generate_event_id(payer, payee, amount, due_date):
    """Generate deterministic event ID for idempotency"""
    data = f"{payer}{payee}{amount}{due_date}"
    return "evt_" + hashlib.sha256(data.encode()).hexdigest()[:16]
```

---

## X402 Payment Flow Example

### Step 1: Initial Request Without Payment
```bash
curl -X GET "http://localhost:8000/credit-score/0xAGENT123" \
  -H "X-Agent-Wallet: 0xREQUESTER"
```

### Step 2: Receive 402 Response
```http
HTTP/1.1 402 Payment Required
X-402-Amount: 0.002
X-402-Currency: USD
X-402-Address: 0xSERVER_WALLET

{
  "error": "payment_required",
  "payment_details": {
    "amount": "0.002",
    "currency": "USD",
    "payment_address": "0xSERVER_WALLET"
  }
}
```

### Step 3: Make Payment via Locus
```python
# Use Locus SDK to make payment
locus_client.send_payment(
    to_address="0xSERVER_WALLET",
    amount=0.002,
    currency="USD"
)
# Receive payment_proof, signature
```

### Step 4: Retry with Payment Proof
```bash
curl -X GET "http://localhost:8000/credit-score/0xAGENT123" \
  -H "X-Agent-Wallet: 0xREQUESTER" \
  -H "X-402-Payment-Proof: proof_abc123" \
  -H "X-402-Amount: 0.002" \
  -H "X-402-Signature: sig_xyz789"
```

### Step 5: Receive Successful Response
```http
HTTP/1.1 200 OK

{
  "agent_id": "0xAGENT123",
  "credit_score": 85,
  "last_updated": "2025-11-15T10:00:00Z",
  "payments_count": 42
}
```

---

## Data Validation

### Wallet Address Format
- Must be hexadecimal string
- Prefixed with `0x`
- 40 characters after prefix (20 bytes)
- Example: `0x1234567890abcdef1234567890abcdef12345678`

### Amount Format
- Positive decimal number
- Up to 2 decimal places
- Maximum: 999999999.99
- Minimum: 0.01

### Date Format
- ISO 8601 format
- Include timezone (preferably UTC)
- Example: `2025-11-15T10:00:00Z`

---

## Testing the API

### Using cURL
See example requests above for each endpoint.

### Using Python
```python
import requests

BASE_URL = "http://localhost:8000"

# Report a payment (free)
response = requests.post(
    f"{BASE_URL}/report-payment",
    headers={"X-Agent-Wallet": "0xAGENT1"},
    json={
        "payer_wallet": "0xAGENT1",
        "payee_wallet": "0xAGENT2",
        "amount": "100.00",
        "due_date": "2025-11-10T00:00:00Z",
        "payment_date": "2025-11-09T12:00:00Z",
        "status": "on_time"
    }
)
print(response.json())

# Get credit score (requires payment)
response = requests.get(
    f"{BASE_URL}/credit-score/0xAGENT1",
    headers={
        "X-Agent-Wallet": "0xREQUESTER",
        "X-402-Payment-Proof": "test_proof",
        "X-402-Amount": "0.002",
        "X-402-Signature": "test_sig"
    }
)
print(response.json())
```

### Using Postman
Import the OpenAPI schema from `http://localhost:8000/openapi.json`

---

## Changelog

### Version 1.0.0 (Initial Release)
- GET /credit-score/{agent_id} - Query credit scores ($0.002)
- GET /payment-history/{agent_id} - Query payment history ($0.001)
- POST /report-payment - Report payment events (free)
- X402 payment protocol integration
- MongoDB storage
- Default credit score: 70 for new agents
- Wallet address-based authentication
