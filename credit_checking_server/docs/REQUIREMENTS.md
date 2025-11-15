# Credit Checking Server - Requirements Document

## Overview
The Credit Checking Server is a Python-based API service that provides creditworthiness verification for payment agents. Agents can query credit scores and payment histories to make informed decisions about payment negotiations. The server implements the x402 protocol for sellers, requiring payment for certain API calls.

## Functional Requirements

### FR1: Credit Score Calculation
- **FR1.1**: Calculate credit scores on a scale of 0-100
- **FR1.2**: Base credit scores on payment history (on-time vs late payments)
- **FR1.3**: Default score for new agents with no history: 70
- **FR1.4**: Credit scoring algorithm must be extensible to support future metrics:
  - Default rate
  - Agent age/reputation
  - Transaction volume
  - Other behavioral metrics

### FR2: Payment History Tracking
- **FR2.1**: Store complete transaction-level payment history
- **FR2.2**: Track the following for each payment event:
  - Payer agent wallet address
  - Payee agent wallet address
  - Payment amount
  - Due date
  - Actual payment date
  - Payment status (on-time, late, defaulted)
  - Days overdue (if applicable)
  - Timestamp of report
- **FR2.3**: Maintain indefinite payment history (no automatic deletion)
- **FR2.4**: Support reporting of both successful and failed payment events

### FR3: API Endpoints

#### FR3.1: GET /credit-score/{agent_id}
- Return credit score (0-100) for specified agent
- Requires x402 payment: $0.002 USD
- Returns 402 Payment Required if payment not included
- Agent identified by wallet address

#### FR3.2: GET /payment-history/{agent_id}
- Return complete payment history for specified agent
- Requires x402 payment: $0.001 USD
- Returns 402 Payment Required if payment not included
- Include both payments made and payments received
- Support pagination for large histories

#### FR3.3: POST /report-payment
- Allow agents to report payment events
- Free endpoint (no x402 payment required)
- Authenticate reporter via wallet address
- Validate payment data before storing
- Return confirmation of successful report

### FR4: Agent Identity & Authentication
- **FR4.1**: Identify agents by wallet address (primary key)
- **FR4.2**: Support future migration to email-based identification
- **FR4.3**: No registration required - agents created on first interaction
- **FR4.4**: Validate wallet address format on all requests

### FR5: X402 Protocol Integration
- **FR5.1**: Implement x402 protocol for sellers
- **FR5.2**: Verify payments before processing paid endpoints
- **FR5.3**: Return HTTP 402 Payment Required with payment details when payment missing/invalid
- **FR5.4**: Support payment retries - agents can resubmit with correct payment
- **FR5.5**: Handle payment failures gracefully with clear error messages

### FR6: Data Integrity
- **FR6.1**: Prevent duplicate payment reports (idempotency)
- **FR6.2**: Validate all input data before storage
- **FR6.3**: Maintain audit trail of all credit score calculations
- **FR6.4**: No dispute mechanism - reports are immutable once accepted

## Non-Functional Requirements

### NFR1: Performance
- **NFR1.1**: API response time < 200ms for credit score queries
- **NFR1.2**: API response time < 500ms for payment history queries
- **NFR1.3**: Support concurrent requests from multiple agents

### NFR2: Scalability
- **NFR2.1**: Use MongoDB for flexible schema evolution
- **NFR2.2**: Design credit scoring to handle millions of transactions per agent
- **NFR2.3**: Support horizontal scaling in future

### NFR3: Reliability
- **NFR3.1**: 99.9% uptime for production deployment
- **NFR3.2**: Graceful error handling with meaningful error messages
- **NFR3.3**: Data persistence across server restarts

### NFR4: Security
- **NFR4.1**: Validate all wallet addresses
- **NFR4.2**: Prevent unauthorized access to payment histories
- **NFR4.3**: Secure MongoDB connection with authentication
- **NFR4.4**: Rate limiting to prevent abuse

### NFR5: Development & Deployment
- **NFR5.1**: Run locally for development
- **NFR5.2**: Use sensible defaults for configuration
- **NFR5.3**: Default port: 8000
- **NFR5.4**: Environment-based configuration via .env file
- **NFR5.5**: Comprehensive error logging

## Technical Requirements

### TR1: Technology Stack
- **Python 3.9+**: Core programming language
- **FastAPI**: Web framework
- **MongoDB**: Database for flexible schema
- **PyMongo/Motor**: MongoDB driver
- **Pydantic**: Data validation
- **X402 Protocol Library**: Payment verification
- **Locus SDK**: Wallet integration

### TR2: Data Storage
- **TR2.1**: MongoDB database with collections:
  - `agents`: Agent profiles and credit scores
  - `payment_events`: Individual payment transactions
  - `credit_history`: Historical credit score snapshots
- **TR2.2**: Implement database indexes for performance:
  - Agent wallet address (primary)
  - Payment dates
  - Payment status

### TR3: Configuration
- **TR3.1**: Environment variables for:
  - MongoDB connection string
  - Server port (default: 8000)
  - X402 payment configuration
  - API pricing configuration
- **TR3.2**: Config validation on startup
- **TR3.3**: Support for development and production environments

## Credit Scoring Algorithm (v1.0)

### Initial Implementation
```
Base Score: 70 (for new agents)

For agents with payment history:
- Start with base score: 70
- For each on-time payment: +0.5 points (max contribution: +30)
- For each late payment (1-7 days): -2 points
- For each late payment (8-30 days): -5 points
- For each late payment (>30 days): -10 points
- For each defaulted payment: -15 points

Final Score: Clamp between 0 and 100
```

### Future Enhancements (Extensibility)
- Weight recent payments more heavily (time decay)
- Factor in total transaction volume
- Consider payment amounts (relative to agent's typical amounts)
- Incorporate agent age/tenure
- Add default rate percentage
- Include dispute resolution outcomes

## API Pricing

| Endpoint | Cost (USD) | Payment Required |
|----------|------------|------------------|
| GET /credit-score/{agent_id} | $0.002 | Yes (x402) |
| GET /payment-history/{agent_id} | $0.001 | Yes (x402) |
| POST /report-payment | Free | No |

## Out of Scope (v1.0)
- Dispute mechanism for payment reports
- Manual admin overrides of credit scores
- Multi-currency support
- Credit score trends/analytics
- Agent reputation beyond payment history
- Email-based authentication (future version)
- Production deployment configuration (Docker, cloud)

## Success Criteria
1. Server successfully starts and connects to MongoDB
2. Agents can report payment events without payment
3. Agents receive 402 errors for unpaid requests to paid endpoints
4. Credit scores are calculated correctly based on payment history
5. New agents receive default score of 70
6. Payment history queries return complete transaction data
7. X402 payment verification works with test payments
8. API responds within performance thresholds
9. Server handles errors gracefully with clear messages
10. Configuration via environment variables works correctly
