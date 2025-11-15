# Credit Checking Server - Architecture Document

## System Overview

The Credit Checking Server is a Python-based microservice that provides creditworthiness verification APIs for payment agents. It implements the x402 protocol for payment-gated API access and uses MongoDB for flexible data storage.

```
┌─────────────────┐         ┌──────────────────────────┐
│  Payment Agent  │────────>│  Credit Checking Server  │
│   (Client)      │  HTTP   │      (FastAPI)           │
└─────────────────┘  +x402  └──────────┬───────────────┘
                                       │
                                       │ PyMongo
                                       ▼
                              ┌─────────────────┐
                              │    MongoDB      │
                              │   Database      │
                              └─────────────────┘
```

## Architecture Layers

### 1. API Layer (FastAPI)
**Responsibility**: Handle HTTP requests, route to services, return responses

**Components**:
- `main.py`: FastAPI application setup, CORS, middleware
- `routes.py`: Endpoint definitions and request/response handling
- Request validation via Pydantic models
- Exception handlers for errors and 402 responses

**Key Features**:
- Automatic OpenAPI documentation
- Request/response validation
- Async request handling
- CORS support for web clients

### 2. Service Layer
**Responsibility**: Business logic, credit calculations, payment verification

**Components**:
- `services/credit_scoring.py`: Credit score calculation logic
- `services/x402_handler.py`: X402 payment verification
- `services/agent_service.py`: Agent data management
- `services/payment_service.py`: Payment history operations

**Credit Scoring Service**:
```python
class CreditScoringService:
    async def calculate_credit_score(agent_id: str) -> int:
        # Fetch payment history
        # Apply scoring algorithm
        # Cache and return score

    async def update_credit_score(agent_id: str):
        # Recalculate after new payment event
```

**X402 Handler Service**:
```python
class X402Handler:
    def verify_payment(request: Request, required_amount: Decimal) -> bool:
        # Extract x402 payment proof from headers
        # Verify with Locus
        # Return validation result

    def generate_402_response(endpoint: str, amount: Decimal) -> Response:
        # Generate 402 Payment Required response
        # Include payment details in headers
```

### 3. Data Access Layer
**Responsibility**: MongoDB interactions, data persistence

**Components**:
- `models.py`: Pydantic models and MongoDB schemas
- `database.py`: MongoDB connection management
- Data validation and transformation

**Collections**:
```
agents
├── wallet_address (PK, indexed)
├── credit_score
├── last_updated
├── created_at
└── total_payments_count

payment_events
├── event_id (PK)
├── payer_wallet (indexed)
├── payee_wallet (indexed)
├── amount
├── due_date (indexed)
├── payment_date
├── status (indexed)
├── days_overdue
├── reported_at
└── reporter_wallet

credit_history (for future analytics)
├── agent_wallet (indexed)
├── score
├── timestamp
└── calculation_factors
```

### 4. Configuration Layer
**Responsibility**: Environment-based configuration

**Components**:
- `config.py`: Configuration classes and validation
- `.env`: Environment variables (not committed)
- `.env.example`: Template for environment setup

## Component Interaction Flow

### Flow 1: Report Payment (Free Endpoint)
```
1. Agent POST /report-payment
   ↓
2. routes.py validates request data
   ↓
3. payment_service.py stores payment event
   ↓
4. credit_scoring.py updates agent's credit score
   ↓
5. Return 201 Created with confirmation
```

### Flow 2: Get Credit Score (Paid Endpoint)
```
1. Agent GET /credit-score/{agent_id}
   ↓
2. x402_handler.py verifies payment ($0.002)
   ├─ Payment valid? → Continue to step 3
   └─ Payment invalid? → Return 402 with payment details
   ↓
3. agent_service.py fetches credit score from DB
   ↓
4. Return 200 OK with credit score
```

### Flow 3: Get Payment History (Paid Endpoint)
```
1. Agent GET /payment-history/{agent_id}
   ↓
2. x402_handler.py verifies payment ($0.001)
   ├─ Payment valid? → Continue to step 3
   └─ Payment invalid? → Return 402 with payment details
   ↓
3. payment_service.py queries payment_events collection
   ↓
4. Apply pagination, format response
   ↓
5. Return 200 OK with payment history
```

## Credit Score Calculation Algorithm

### Algorithm v1.0
```python
def calculate_credit_score(payment_events: List[PaymentEvent]) -> int:
    """
    Calculate credit score based on payment history

    Base score: 70
    Adjustments:
    - On-time payment: +0.5 (max +30)
    - Late 1-7 days: -2
    - Late 8-30 days: -5
    - Late >30 days: -10
    - Defaulted: -15

    Returns: Score clamped to [0, 100]
    """
    if not payment_events:
        return 70  # Default for new agents

    score = 70
    on_time_count = 0

    for event in payment_events:
        if event.status == "on_time":
            on_time_count += 1
        elif event.status == "late":
            if event.days_overdue <= 7:
                score -= 2
            elif event.days_overdue <= 30:
                score -= 5
            else:
                score -= 10
        elif event.status == "defaulted":
            score -= 15

    # Cap on-time bonus at +30
    on_time_bonus = min(on_time_count * 0.5, 30)
    score += on_time_bonus

    # Clamp to valid range
    return max(0, min(100, score))
```

### Future Enhancements
- Time decay: Recent payments weighted more
- Volume weighting: Large payments weighted more
- Relative scoring: Compare to agent's typical behavior
- Reputation factors: Agent age, transaction count

## X402 Protocol Integration

### Seller Implementation

The server implements the x402 protocol as a seller (service provider requiring payment).

**Payment Verification Flow**:
1. Client sends request with x402 payment proof in headers
2. Server extracts payment details: `X-402-Payment-Proof`, `X-402-Amount`, `X-402-Signature`
3. Server verifies payment with Locus wallet
4. If valid, process request
5. If invalid/missing, return 402 with payment instructions

**402 Response Format**:
```
HTTP/1.1 402 Payment Required
X-402-Amount: 0.002
X-402-Currency: USD
X-402-Address: <server_wallet_address>
X-402-Endpoint: /credit-score/{agent_id}

{
  "error": "Payment required",
  "amount": "0.002",
  "currency": "USD",
  "payment_address": "<wallet_address>",
  "instructions": "Include X-402-Payment-Proof header with valid payment"
}
```

**Retry Mechanism**:
- Agents receive 402, make payment to server's wallet
- Agent retries request with payment proof in headers
- Server verifies and processes request

## Data Models

### Agent Model
```python
class Agent(BaseModel):
    wallet_address: str  # Primary key
    credit_score: int = 70
    last_updated: datetime
    created_at: datetime
    total_payments_made: int = 0
    total_payments_received: int = 0
```

### Payment Event Model
```python
class PaymentEvent(BaseModel):
    event_id: str  # UUID
    payer_wallet: str
    payee_wallet: str
    amount: Decimal
    currency: str = "USD"
    due_date: datetime
    payment_date: Optional[datetime]
    status: Literal["on_time", "late", "defaulted"]
    days_overdue: int = 0
    reported_at: datetime
    reporter_wallet: str
```

### Credit Score Response
```python
class CreditScoreResponse(BaseModel):
    agent_id: str
    credit_score: int
    last_updated: datetime
    payments_count: int
```

### Payment History Response
```python
class PaymentHistoryResponse(BaseModel):
    agent_id: str
    total_count: int
    page: int
    page_size: int
    payments: List[PaymentEvent]
```

## Database Design

### Indexes
```javascript
// agents collection
db.agents.createIndex({ "wallet_address": 1 }, { unique: true })
db.agents.createIndex({ "credit_score": 1 })

// payment_events collection
db.payment_events.createIndex({ "event_id": 1 }, { unique: true })
db.payment_events.createIndex({ "payer_wallet": 1 })
db.payment_events.createIndex({ "payee_wallet": 1 })
db.payment_events.createIndex({ "status": 1 })
db.payment_events.createIndex({ "due_date": 1 })
db.payment_events.createIndex({ "reported_at": -1 })

// Compound indexes for common queries
db.payment_events.createIndex({ "payer_wallet": 1, "status": 1 })
db.payment_events.createIndex({ "payee_wallet": 1, "status": 1 })
```

### Data Consistency
- Atomic updates for credit score recalculations
- Idempotency for payment event reports (check event_id)
- Transaction support for multi-document operations (future)

## Security Considerations

### Authentication
- Wallet address-based identification
- Future: Support email-based auth
- No registration required - auto-create on first use

### Authorization
- Agents can only query their own payment history (future enhancement)
- All agents can query any credit score (with payment)
- Payment reports validated against reporter's wallet

### Data Protection
- MongoDB authentication required in production
- Environment variables for sensitive config
- Rate limiting to prevent abuse (future)
- Input validation on all endpoints

### Payment Security
- Verify x402 payments before processing
- Validate payment amounts match requirements
- Prevent replay attacks with payment nonces
- Secure webhook verification for Locus

## Error Handling

### Error Types
```python
class CreditServerError(Exception):
    """Base error class"""

class PaymentRequiredError(CreditServerError):
    """402 - Payment required"""

class InvalidPaymentError(CreditServerError):
    """400 - Invalid payment proof"""

class AgentNotFoundError(CreditServerError):
    """404 - Agent doesn't exist"""

class InvalidWalletError(CreditServerError):
    """400 - Invalid wallet address format"""

class DatabaseError(CreditServerError):
    """500 - Database operation failed"""
```

### Error Response Format
```json
{
  "error": "error_type",
  "message": "Human-readable error message",
  "details": {
    "field": "Additional context"
  },
  "timestamp": "2025-11-15T10:00:00Z"
}
```

## Configuration

### Environment Variables
```bash
# Server
SERVER_HOST=localhost
SERVER_PORT=8000
ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=credit_checking

# X402 / Locus
LOCUS_WALLET_ADDRESS=<server_wallet_address>
LOCUS_API_KEY=<api_key>
X402_ENABLED=true

# Pricing (USD)
CREDIT_SCORE_PRICE=0.002
PAYMENT_HISTORY_PRICE=0.001

# Logging
LOG_LEVEL=INFO
```

### Configuration Validation
- Validate all required vars on startup
- Fail fast if critical config missing
- Use sensible defaults for optional config
- Log configuration (redact secrets)

## Deployment Architecture

### Local Development
```
┌─────────────────────────┐
│  Credit Server          │
│  localhost:8000         │
└───────┬─────────────────┘
        │
        ▼
┌─────────────────────────┐
│  MongoDB                │
│  localhost:27017        │
└─────────────────────────┘
```

### Future: Production (Docker)
```
┌─────────────────────────┐
│  Docker Container       │
│  ├─ FastAPI App         │
│  └─ Gunicorn/Uvicorn    │
└───────┬─────────────────┘
        │
        ▼
┌─────────────────────────┐
│  MongoDB Atlas          │
│  (Cloud)                │
└─────────────────────────┘
```

## Testing Strategy

### Unit Tests
- Credit scoring algorithm
- Payment validation logic
- Data model validation
- Configuration loading

### Integration Tests
- API endpoint responses
- MongoDB operations
- X402 payment verification
- Error handling flows

### E2E Tests
- Complete payment report flow
- Credit score query with payment
- Payment history retrieval
- Agent lifecycle (create, update, query)

## Performance Considerations

### Optimization Strategies
1. **Caching**: Cache credit scores with TTL
2. **Indexing**: Proper DB indexes for queries
3. **Async I/O**: FastAPI async for concurrent requests
4. **Pagination**: Limit payment history response size
5. **Connection Pooling**: Reuse MongoDB connections

### Monitoring Points
- API response times
- Database query times
- Payment verification latency
- Error rates by endpoint
- Credit score calculation time

## Extensibility

### Future Enhancements
1. **Advanced Credit Scoring**:
   - Time-weighted payment history
   - Transaction volume factors
   - Agent reputation metrics

2. **Analytics**:
   - Credit score trends
   - Network-wide statistics
   - Risk assessment tools

3. **Features**:
   - Email-based authentication
   - Dispute mechanism
   - Manual admin overrides
   - Multi-currency support

4. **Infrastructure**:
   - Horizontal scaling
   - Redis caching layer
   - Message queue for async tasks
   - Webhook notifications

## Technology Choices Rationale

| Technology | Reason |
|------------|--------|
| FastAPI | Modern async Python framework, auto documentation, high performance |
| MongoDB | Flexible schema for evolution, handles nested documents, scales horizontally |
| Pydantic | Type safety, validation, FastAPI integration |
| Motor | Async MongoDB driver for FastAPI |
| X402 Library | Standard protocol for agent payments |
| Locus SDK | Wallet integration for payment verification |

## Directory Structure
```
credit_checking_server/
├── src/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app setup
│   ├── config.py               # Configuration management
│   ├── database.py             # MongoDB connection
│   ├── models.py               # Pydantic models
│   ├── routes.py               # API endpoints
│   ├── dependencies.py         # FastAPI dependencies
│   ├── exceptions.py           # Custom exceptions
│   └── services/
│       ├── __init__.py
│       ├── agent_service.py    # Agent operations
│       ├── payment_service.py  # Payment history
│       ├── credit_scoring.py   # Score calculation
│       └── x402_handler.py     # Payment verification
├── tests/
│   ├── __init__.py
│   ├── test_credit_scoring.py
│   ├── test_routes.py
│   ├── test_x402.py
│   └── test_models.py
├── requirements.txt
├── .env.example
├── .gitignore
├── README.md
├── REQUIREMENTS.md
├── ARCHITECTURE.md
└── API_SPEC.md
```
