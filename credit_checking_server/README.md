# Credit Checking Server

A Python-based microservice that provides creditworthiness verification APIs for payment agents. The server implements the x402 protocol for payment-gated API access and uses MongoDB for flexible data storage.

## Overview

The Credit Checking Server enables payment agents to:
- Query credit scores of other agents (with payment)
- Retrieve payment history of agents (with payment)
- Report payment events to build credit history (free)

Agents can use this service to make informed decisions during payment negotiations, determining whether an agent requesting delayed payment is creditworthy and trustworthy.

## Features

- **Credit Score Calculation**: 0-100 score based on payment history (on-time, late, defaulted)
- **Payment History Tracking**: Complete transaction-level history with MongoDB
- **X402 Protocol**: Payment-gated API access using the x402 protocol for sellers
- **Locus Integration**: Payment verification via Locus wallet
- **Default Scoring**: New agents start at 70 credit score
- **Wallet-based Identity**: Agents identified by wallet addresses
- **Extensible Scoring**: Designed to support future scoring metrics

## Quick Start

### Prerequisites

- Python 3.9+
- MongoDB 4.4+ (running locally or accessible via URI)
- Locus wallet account (for payment verification)

### Installation

1. Clone the repository and navigate to the credit server directory:
```bash
cd credit_checking_server
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

5. Start MongoDB (if running locally):
```bash
# macOS with Homebrew:
brew services start mongodb-community

# Or using Docker:
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

6. Run the server:
```bash
uvicorn src.main:app --host localhost --port 8000 --reload
```

**Note**: Run this command from the `credit_checking_server` directory (not from inside `src`).

The server will be available at `http://localhost:8000`

## API Documentation

Once the server is running, interactive API documentation is available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI Schema: `http://localhost:8000/openapi.json`

For detailed API specifications, see [API_SPEC.md](API_SPEC.md).

## API Endpoints

| Endpoint | Method | Price | Description |
|----------|--------|-------|-------------|
| `/health` | GET | Free | Health check |
| `/credit-score/{agent_id}` | GET | $0.002 | Get credit score (requires x402 payment) |
| `/payment-history/{agent_id}` | GET | $0.001 | Get payment history (requires x402 payment) |
| `/report-payment` | POST | Free | Report payment event |

## Configuration

Configuration is managed via environment variables. Copy `.env.example` to `.env` and customize:

```bash
# Server
SERVER_HOST=localhost
SERVER_PORT=8000
ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=credit_checking

# Locus Wallet
LOCUS_WALLET_ADDRESS=0xYOUR_WALLET_ADDRESS
LOCUS_API_KEY=your_api_key_here

# API Pricing
CREDIT_SCORE_PRICE=0.002
PAYMENT_HISTORY_PRICE=0.001
```

See [.env.example](.env.example) for all configuration options.

## Credit Scoring Algorithm

**Version 1.0** - Simple payment history-based scoring:

```
Base Score: 70 (for new agents)

Adjustments:
- On-time payment: +0.5 points (max +30 total)
- Late 1-7 days: -2 points
- Late 8-30 days: -5 points
- Late >30 days: -10 points
- Defaulted: -15 points

Final Score: Clamped to [0, 100]
```

The algorithm is designed to be extensible for future enhancements like time-weighted scoring, transaction volume factors, and agent reputation metrics.

## Usage Examples

### Report a Payment (Python)

```python
import requests

response = requests.post(
    "http://localhost:8000/report-payment",
    headers={"X-Agent-Wallet": "0xYOUR_WALLET"},
    json={
        "payer_wallet": "0xPAYER_WALLET",
        "payee_wallet": "0xPAYEE_WALLET",
        "amount": "150.00",
        "due_date": "2025-11-10T00:00:00Z",
        "payment_date": "2025-11-09T15:30:00Z",
        "status": "on_time"
    }
)
print(response.json())
```

### Query Credit Score (with x402 payment)

```python
import requests

response = requests.get(
    "http://localhost:8000/credit-score/0xAGENT_WALLET",
    headers={
        "X-Agent-Wallet": "0xREQUESTER_WALLET",
        "X-402-Payment-Proof": "proof_token",
        "X-402-Amount": "0.002",
        "X-402-Signature": "signature"
    }
)
print(response.json())
```

### Get Payment History (with x402 payment)

```python
response = requests.get(
    "http://localhost:8000/payment-history/0xAGENT_WALLET",
    headers={
        "X-Agent-Wallet": "0xREQUESTER_WALLET",
        "X-402-Payment-Proof": "proof_token",
        "X-402-Amount": "0.001",
        "X-402-Signature": "signature"
    },
    params={"page": 1, "page_size": 50}
)
print(response.json())
```

## Testing

Run the test suite:

```bash
pytest
```

Run with coverage:

```bash
pytest --cov=src --cov-report=html
```

## Project Structure

```
credit_checking_server/
├── src/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Configuration management
│   ├── database.py          # MongoDB connection
│   ├── models.py            # Pydantic models
│   ├── routes.py            # API endpoints
│   ├── dependencies.py      # FastAPI dependencies
│   ├── exceptions.py        # Custom exceptions
│   └── services/
│       ├── agent_service.py    # Agent operations
│       ├── payment_service.py  # Payment history
│       ├── credit_scoring.py   # Score calculation
│       └── x402_handler.py     # Payment verification
├── tests/
│   ├── test_credit_scoring.py
│   ├── test_routes.py
│   └── test_models.py
├── requirements.txt
├── .env.example
├── .gitignore
├── README.md
├── REQUIREMENTS.md          # Detailed requirements
├── ARCHITECTURE.md          # System architecture
└── API_SPEC.md             # API specification
```

## Documentation

- [REQUIREMENTS.md](REQUIREMENTS.md) - Detailed functional and technical requirements
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture and design decisions
- [API_SPEC.md](API_SPEC.md) - Complete API documentation with examples

## Development

### Code Style

This project uses:
- **Black** for code formatting
- **Flake8** for linting
- **MyPy** for type checking

Run formatters and linters:

```bash
black src/ tests/
flake8 src/ tests/
mypy src/
```

### Pre-commit Hooks

Install pre-commit hooks:

```bash
pre-commit install
```

## X402 Protocol Integration

The server implements the x402 protocol as a seller (service requiring payment). For paid endpoints:

1. Client sends request without payment
2. Server returns `402 Payment Required` with payment details
3. Client makes payment via Locus
4. Client retries request with payment proof in headers
5. Server verifies payment and processes request

See [API_SPEC.md](API_SPEC.md) for detailed x402 flow examples.

## Future Enhancements

- Advanced credit scoring with time-weighted history
- Agent reputation metrics beyond payment history
- Email-based authentication alongside wallet addresses
- Dispute mechanism for payment reports
- Analytics and credit score trends
- Redis caching layer for performance
- Webhook notifications for credit score changes
- Multi-currency support

## Technology Stack

- **FastAPI**: Modern Python web framework
- **MongoDB**: NoSQL database for flexible schema
- **Pydantic**: Data validation and settings
- **Motor**: Async MongoDB driver
- **X402 Protocol**: Payment-gated API access
- **Locus**: Wallet and payment integration

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation as needed
4. Run tests and linters before committing

## License

[Add license information here]

## Support

For issues and questions:
- Create an issue in the repository
- Refer to the documentation in the `docs/` directory
- Check the API documentation at `/docs` when server is running

## Version

Current version: **1.0.0**

---

Built for the Locus Hackathon - Enabling trustworthy agent-to-agent payments
