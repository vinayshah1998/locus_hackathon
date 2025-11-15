# Locus Hackathon - Payment Remediation Agent System

## Project Overview

This project implements a system where personalized AI agents interact with each other on behalf of their humans to handle payment remediations. The system enables autonomous negotiation between agents to seek and settle payments, with configurable personalities ranging from "pay responsibly" to "delay payments when money is tight."

The system consists of two main components:
1. **Payment Agents** - AI agents that interact with users and negotiate with other agents
2. **Credit Checking Server** - Centralized service for creditworthiness verification

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Ecosystem                          │
│                                                                 │
│  ┌──────────────┐                          ┌──────────────┐    │
│  │   Human A    │                          │   Human B    │    │
│  └──────┬───────┘                          └──────┬───────┘    │
│         │                                          │            │
│         │ Configures                              │ Configures │
│         │ Personality                             │ Personality│
│         ▼                                          ▼            │
│  ┌──────────────┐                          ┌──────────────┐    │
│  │   Agent A    │◄────────Negotiates──────►│   Agent B    │    │
│  │ (Web UI)     │        Payments          │ (Web UI)     │    │
│  └──────┬───────┘                          └──────┬───────┘    │
│         │                                          │            │
└─────────┼──────────────────────────────────────────┼────────────┘
          │                                          │
          │ Query Credit                    Query Credit
          │ Make Payments                   Make Payments
          │                                          │
          ▼                                          ▼
   ┌──────────────────────────────────────────────────────┐
   │        Credit Checking Server (Python)               │
   │                                                      │
   │  ┌────────────────────────────────────────────┐    │
   │  │  APIs (x402 payment required):             │    │
   │  │  - GET /credit-score/{agent_id} ($0.002)   │    │
   │  │  - GET /payment-history/{agent_id} ($0.001)│    │
   │  │  - POST /report-payment (free)             │    │
   │  └────────────────────────────────────────────┘    │
   │                                                      │
   │  MongoDB: Agent profiles, payment history           │
   └──────────────────────────────────────────────────────┘
          ▲
          │ Payments via Locus Wallet
          │
   ┌──────────────────────────┐
   │   Locus Payment System   │
   │   (Wallet Integration)   │
   └──────────────────────────┘
```

## Technology Stack

### Payment Agents
- **Framework**: [Anthropic Agent SDK](https://docs.claude.com/en/docs/agent-sdk/overview)
- **Model**: Claude (Sonnet 4.5)
- **UI**: Web application in browser
- **Payments**: Locus wallet integration
- **Protocol**: x402 protocol for buyers

### Credit Checking Server
- **Language**: Python 3.9+
- **Web Framework**: FastAPI
- **Database**: MongoDB (flexible schema)
- **Validation**: Pydantic
- **Protocol**: x402 protocol for sellers
- **Payments**: Locus SDK for verification

### Payment Infrastructure
- **Wallet System**: [Locus](https://docs.paywithlocus.com/getting-started)
- **Payment Protocol**: [x402 Protocol](https://x402.gitbook.io/x402)

## Project Structure

```
locus_hackathon/
├── CLAUDE.md                    # This file - AI assistant context
├── requirements.md              # Original project requirements
├── README.md                    # Repository overview
│
├── agent/                       # Payment agent implementation
│   └── README.md                # (To be implemented)
│   # Agent will use Anthropic Agent SDK
│   # Implements x402 protocol for buyers
│   # Web UI for user interaction
│
└── credit_checking_server/      # Credit verification service
    ├── REQUIREMENTS.md          # Detailed requirements
    ├── ARCHITECTURE.md          # System design
    ├── API_SPEC.md             # API documentation
    ├── README.md               # User guide
    ├── GETTING_STARTED.md      # Implementation guide
    │
    ├── src/
    │   ├── config.py           # Configuration management ✅
    │   ├── models.py           # Data models & validation ✅
    │   ├── main.py             # FastAPI application (TODO)
    │   ├── database.py         # MongoDB connection (TODO)
    │   ├── routes.py           # API endpoints (TODO)
    │   └── services/
    │       ├── credit_scoring.py   # Score calculation (TODO)
    │       ├── agent_service.py    # Agent operations (TODO)
    │       ├── payment_service.py  # Payment history (TODO)
    │       └── x402_handler.py     # Payment verification (TODO)
    │
    └── tests/                  # Test suite (TODO)
```

## Component Details

### 1. Payment Agents (Agent Component)

**Purpose**: Autonomous agents that handle payment negotiations on behalf of users.

**Responsibilities**:
- Seek payments from parties that owe money to their human
- Pay parties that require money from their human
- Negotiate payment terms based on configured personality
- Query credit checking server for counterparty creditworthiness
- Make payments via Locus wallet
- Implement x402 protocol as buyer (pay for credit check APIs)

**Agent Personalities**:
Configurable range from:
- "Be responsible and pay out debts to everyone"
- "Money is tight, don't pay anyone and drag out payment"

**Interaction Flow**:
1. User configures agent personality via web UI
2. Agent identifies required payments (incoming/outgoing)
3. For incoming payments: Agent contacts debtor's agent, negotiates
4. Before accepting delayed payment: Query credit server for creditworthiness
5. Make decision based on credit score + personality configuration
6. Execute payment via Locus or continue negotiation

**Status**: To be implemented

### 2. Credit Checking Server

**Purpose**: Centralized service for maintaining agent creditworthiness and payment history.

**Key Features**:
- Credit scoring algorithm (0-100 scale)
- Payment history tracking (complete transaction details)
- X402 payment-gated APIs
- Default credit score: 70 for new agents
- Wallet address-based agent identification

**Credit Scoring Algorithm v1.0**:
```
Base Score: 70

Adjustments:
- On-time payment: +0.5 (max +30)
- Late 1-7 days: -2
- Late 8-30 days: -5
- Late >30 days: -10
- Defaulted: -15

Final: Clamped to [0-100]
```

**API Endpoints**:
- `GET /credit-score/{agent_id}` - Returns credit score ($0.002)
- `GET /payment-history/{agent_id}` - Returns payment history ($0.001)
- `POST /report-payment` - Report payment event (free)

**Implementation Status**:
- ✅ Requirements documented (REQUIREMENTS.md)
- ✅ Architecture designed (ARCHITECTURE.md)
- ✅ API specification (API_SPEC.md)
- ✅ Data models & validation (models.py)
- ✅ Configuration management (config.py)
- 🔨 Core services (TODO)
- 🔨 API routes (TODO)
- 🔨 Tests (TODO)

## X402 Protocol Integration

The x402 protocol enables micropayments for API access.

### Agents (Buyers)
- Make payment requests to credit checking server
- Include x402 payment proof in API request headers
- Retry requests with payment if initially rejected with 402

### Credit Server (Seller)
- Verify x402 payment proofs
- Return 402 Payment Required for unpaid requests
- Process request only after payment verification
- Different pricing for different endpoints

**Payment Flow**:
1. Agent sends API request without payment
2. Server returns `402 Payment Required` with payment details
3. Agent makes payment via Locus
4. Agent retries request with payment proof in headers
5. Server verifies payment and processes request

## Data Models

### Agent (MongoDB)
```python
{
    "wallet_address": "0x...",      # Primary key
    "credit_score": 70,             # 0-100
    "last_updated": "2025-11-15T...",
    "created_at": "2025-11-01T...",
    "total_payments_made": 20,
    "total_payments_received": 22
}
```

### Payment Event (MongoDB)
```python
{
    "event_id": "evt_...",           # Unique identifier
    "payer_wallet": "0x...",
    "payee_wallet": "0x...",
    "amount": 150.00,
    "currency": "USD",
    "due_date": "2025-11-10T...",
    "payment_date": "2025-11-09T...",
    "status": "on_time",             # on_time, late, defaulted
    "days_overdue": 0,
    "reported_at": "2025-11-09T...",
    "reporter_wallet": "0x..."
}
```

## Development Guidelines

### Credit Checking Server

**Starting the server**:
```bash
cd credit_checking_server
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Edit with your config
# Run from credit_checking_server directory (not from src)
uvicorn src.main:app --reload
```

**Configuration**:
- Copy `.env.example` to `.env`
- Set `MONGODB_URI` (local or Atlas)
- Set `LOCUS_WALLET_ADDRESS` and `LOCUS_API_KEY`
- Adjust pricing if needed

**Testing**:
```bash
pytest                              # Run all tests
pytest --cov=src                    # With coverage
black src/ tests/                   # Format code
mypy src/                          # Type checking
```

**Implementation Order**:
1. Database connection (database.py)
2. Credit scoring service (services/credit_scoring.py)
3. Agent service (services/agent_service.py)
4. Payment service (services/payment_service.py)
5. X402 handler (services/x402_handler.py) - can start with mock
6. API routes (routes.py)
7. Main app (main.py)
8. Tests

### Payment Agents (To Be Implemented)

**Suggested Structure**:
```
agent/
├── README.md
├── requirements.txt
├── src/
│   ├── agent.py              # Main agent loop (Agent SDK)
│   ├── tools.py              # Agent tools
│   ├── personality.py        # Personality configuration
│   ├── credit_client.py      # Credit server API client
│   ├── locus_client.py       # Locus wallet integration
│   └── negotiation.py        # Payment negotiation logic
├── webapp/
│   ├── index.html           # Web UI
│   └── ...
└── tests/
```

## Key Concepts

### Credit Checking
- Agents query credit server before accepting delayed payments
- Credit score indicates payment reliability (0-100)
- Higher score = more trustworthy
- Score influenced by payment history (on-time vs late vs defaulted)

### Payment Negotiation
- Agent A owes Agent B money
- Agent A requests delayed payment
- Agent B queries credit server for Agent A's score
- Agent B decides based on credit score + configured personality
- If accepted: Payment scheduled for later, event reported
- If rejected: Immediate payment required

### Personality Configuration
Users configure how aggressive/lenient their agent should be:
- **Conservative**: Pay debts immediately, demand immediate payment
- **Balanced**: Consider credit scores, negotiate reasonably
- **Aggressive**: Delay payments when possible, demand early payment

### Creditworthiness Context
The credit checking server provides context for agents to make decisions:
- "This agent has score 85, safe to accept delayed payment"
- "This agent has score 40, high default risk, demand immediate payment"
- "This agent is new (score 70), use caution"

## Design Decisions

### Why MongoDB?
- Flexible schema for evolving credit scoring factors
- Handles nested payment event documents
- Easy to add new fields without migrations
- Scales horizontally

### Why X402 Protocol?
- Standard protocol for agentic payments
- Enables micropayments for API access
- Prevents abuse (APIs require payment)
- Simple integration with Locus

### Why Wallet-Based Identity?
- Ties credit history to payment address
- No separate registration required
- Compatible with Locus payment system
- Can migrate to email later if needed

### Why Centralized Credit Server?
- Prevents agents from falsifying credit history
- Single source of truth for payment history
- Enables network-wide credit scoring
- Reduces defaults through transparency

## API Pricing Rationale

| Endpoint | Price | Reason |
|----------|-------|--------|
| Credit Score | $0.002 | Most valuable - prevents defaults |
| Payment History | $0.001 | Detailed data, less critical |
| Report Payment | Free | Encourages reporting, builds credit data |

## Future Enhancements

### Credit Scoring
- Time-weighted payment history (recent more important)
- Transaction volume factors
- Agent age/tenure weighting
- Network reputation metrics
- Dispute resolution system

### Agent Features
- Multi-agent coordination (group payments)
- Automated payment scheduling
- Dispute filing and resolution
- Payment reminders and notifications
- Analytics dashboard

### Infrastructure
- Redis caching for credit scores
- Webhook notifications
- Rate limiting
- Multi-currency support
- Production deployment (Docker, cloud)

## Common Workflows

### Agent Queries Credit Before Accepting Delayed Payment
1. Agent B's agent receives request from Agent A to pay $100 in 30 days
2. Agent B queries: `GET /credit-score/0xAGENT_A` (pays $0.002)
3. Server returns: `{"credit_score": 85}`
4. Agent B evaluates: Score 85 + personality "balanced" → Accept
5. Agent B responds to Agent A: "Accepted, pay in 30 days"
6. After 30 days, payment made, Agent B reports:
   `POST /report-payment` with on_time status
7. Agent A's credit score increases

### Agent Reports Late Payment
1. Payment due on Nov 10, actually paid Nov 18 (8 days late)
2. Agent reports: `POST /report-payment` with status="late", days_overdue=8
3. Server calculates: Payer loses 5 points (8-30 days late)
4. Server updates credit score in database
5. Future queries will reflect updated score

### New Agent Joins Network
1. Agent with wallet `0xNEW_AGENT` makes first transaction
2. Another agent queries: `GET /credit-score/0xNEW_AGENT`
3. Server finds no history, returns default score: 70
4. Response includes `"is_new_agent": true`
5. Querying agent uses caution with new agent
6. As new agent makes payments, score adjusts

## Important Files to Review

When working on this project, refer to these key files:

### For Overall Context
- `requirements.md` - Original project requirements
- `CLAUDE.md` - This file

### For Credit Server
- `credit_checking_server/REQUIREMENTS.md` - Detailed requirements
- `credit_checking_server/ARCHITECTURE.md` - System design
- `credit_checking_server/API_SPEC.md` - API documentation
- `credit_checking_server/GETTING_STARTED.md` - Implementation guide
- `credit_checking_server/src/models.py` - Data models (complete)
- `credit_checking_server/src/config.py` - Configuration (complete)

### For Agents (To Be Created)
- `agent/README.md` - Agent documentation (TODO)
- Anthropic Agent SDK documentation
- X402 buyer protocol documentation
- Locus SDK documentation

## Testing Strategy

### Credit Server
- **Unit Tests**: Credit scoring algorithm, validation, config
- **Integration Tests**: API endpoints, database operations
- **E2E Tests**: Complete payment report → credit score update flow

### Agents (Future)
- **Unit Tests**: Personality logic, negotiation decisions
- **Integration Tests**: Credit server API calls, Locus payments
- **E2E Tests**: Full negotiation flow between two agents

## Environment Setup

### Credit Server
```bash
# Required
MONGODB_URI=mongodb://localhost:27017
LOCUS_WALLET_ADDRESS=0x...
LOCUS_API_KEY=...

# Optional (have defaults)
SERVER_PORT=8000
DEFAULT_CREDIT_SCORE=70
CREDIT_SCORE_PRICE=0.002
```

### Agents (Future)
```bash
# Will need
ANTHROPIC_API_KEY=...
LOCUS_WALLET_ADDRESS=0x...
LOCUS_API_KEY=...
CREDIT_SERVER_URL=http://localhost:8000
AGENT_PERSONALITY=balanced  # conservative|balanced|aggressive
```

## Hackathon Goals

Primary objectives:
1. ✅ Design comprehensive credit checking system
2. 🔨 Implement credit checking server (in progress)
3. 🔜 Implement payment agents with Agent SDK
4. 🔜 Enable agent-to-agent payment negotiation
5. 🔜 Demonstrate personality-driven payment strategies
6. 🔜 Show x402 protocol integration for micropayments
7. 🔜 Prove Locus wallet integration works smoothly

## Success Criteria

- [ ] Credit server running and responding to API calls
- [ ] Agents can query credit scores (with payment)
- [ ] Agents can report payment events
- [ ] Credit scores update based on payment history
- [ ] Two agents can negotiate payment via web UI
- [ ] Agent checks credit before accepting delayed payment
- [ ] X402 payment protocol works end-to-end
- [ ] Locus payments execute successfully
- [ ] Different personalities produce different negotiation outcomes

---

**Project Status**: Credit server planned and partially implemented. Agent implementation pending.

**Next Steps**:
1. Complete credit server implementation (database, services, routes)
2. Test credit server APIs
3. Design and implement payment agent
4. Build web UI for agent interaction
5. Integrate x402 and Locus
6. Demo end-to-end payment negotiation
