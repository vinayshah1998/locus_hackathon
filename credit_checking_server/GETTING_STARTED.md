# Getting Started with Credit Checking Server

This guide will help you get the Credit Checking Server up and running quickly.

## What You Have Now

The credit server has been planned with comprehensive documentation:

1. **[REQUIREMENTS.md](REQUIREMENTS.md)** - Complete functional and technical requirements
2. **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture and design decisions
3. **[API_SPEC.md](API_SPEC.md)** - Detailed API documentation with examples
4. **[README.md](README.md)** - User-facing documentation and quick start guide

## Project Structure

```
credit_checking_server/
├── REQUIREMENTS.md          ← Detailed requirements
├── ARCHITECTURE.md          ← System design
├── API_SPEC.md             ← API documentation
├── GETTING_STARTED.md      ← This file
├── README.md               ← Main documentation
├── requirements.txt        ← Python dependencies
├── .env.example           ← Configuration template
├── .gitignore
├── src/
│   ├── __init__.py
│   ├── config.py          ← Configuration management (COMPLETE)
│   ├── models.py          ← Data models (COMPLETE)
│   ├── main.py            ← FastAPI app (TODO)
│   ├── database.py        ← MongoDB connection (TODO)
│   ├── routes.py          ← API endpoints (TODO)
│   ├── dependencies.py    ← FastAPI deps (TODO)
│   ├── exceptions.py      ← Error handling (TODO)
│   └── services/
│       ├── __init__.py
│       ├── agent_service.py    (TODO)
│       ├── payment_service.py  (TODO)
│       ├── credit_scoring.py   (TODO)
│       └── x402_handler.py     (TODO)
└── tests/
    ├── __init__.py
    └── (test files TODO)
```

## What's Been Completed

### Documentation
- ✅ Complete requirements specification
- ✅ System architecture design
- ✅ API specification with examples
- ✅ User documentation (README)

### Code Structure
- ✅ Project directory structure
- ✅ Python dependencies defined ([requirements.txt](requirements.txt))
- ✅ Configuration management ([src/config.py](src/config.py))
- ✅ Data models and validation ([src/models.py](src/models.py))
- ✅ Environment template ([.env.example](.env.example))

### Ready for Implementation
The foundational planning and structure is complete. The next steps are to implement:
1. Database connection layer
2. Service layer (credit scoring, payment processing, x402 handling)
3. API routes and endpoints
4. Tests

## Next Steps to Build the Server

### 1. Set Up Your Environment

```bash
# Navigate to the server directory
cd credit_checking_server

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your MongoDB URI and Locus credentials
```

### 2. Start MongoDB

**Option A: Local MongoDB**
```bash
# macOS with Homebrew
brew services start mongodb-community

# Ubuntu/Debian
sudo systemctl start mongod
```

**Option B: Docker**
```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

**Option C: MongoDB Atlas (Cloud)**
- Sign up at https://www.mongodb.com/cloud/atlas
- Create a cluster and get connection string
- Update `MONGODB_URI` in `.env`

### 3. Implement Core Components

Follow this order:

1. **Database Layer** (`src/database.py`)
   - MongoDB connection management
   - Database initialization
   - Index creation

2. **Service Layer** (`src/services/`)
   - `credit_scoring.py` - Implement scoring algorithm
   - `agent_service.py` - Agent CRUD operations
   - `payment_service.py` - Payment history operations
   - `x402_handler.py` - Payment verification (placeholder for now)

3. **API Layer**
   - `exceptions.py` - Custom exceptions
   - `dependencies.py` - FastAPI dependencies (get DB, verify payment)
   - `routes.py` - API endpoint implementations
   - `main.py` - FastAPI app setup

4. **Testing**
   - Write tests as you implement features
   - Use `pytest` for testing

### 4. Run the Server

```bash
cd src
uvicorn main:app --host localhost --port 8000 --reload
```

Visit:
- API: http://localhost:8000
- Docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Key Design Decisions

### Credit Scoring (v1.0)
- **Base Score**: 70 for new agents
- **Algorithm**: Payment history-based
  - On-time: +0.5 (max +30)
  - Late 1-7 days: -2
  - Late 8-30 days: -5
  - Late >30 days: -10
  - Defaulted: -15
- **Range**: 0-100 (clamped)

### API Pricing
- GET `/credit-score/{agent_id}`: $0.002
- GET `/payment-history/{agent_id}`: $0.001
- POST `/report-payment`: Free

### Authentication
- **Current**: Wallet address-based (0x... format)
- **Future**: Support email-based authentication

### X402 Protocol
- Implement as seller (service requiring payment)
- Return 402 for unpaid requests
- Verify payment before processing
- Support payment retries

## Implementation Tips

### 1. Start Simple
- Get basic endpoints working without x402 first
- Add payment verification once core logic works
- Use mock/placeholder for Locus integration initially

### 2. Test Early
- Write tests alongside implementation
- Test credit scoring algorithm thoroughly
- Test edge cases (new agents, defaulted payments, etc.)

### 3. Use the Documentation
- Refer to [ARCHITECTURE.md](ARCHITECTURE.md) for design patterns
- Check [API_SPEC.md](API_SPEC.md) for exact request/response formats
- Follow [REQUIREMENTS.md](REQUIREMENTS.md) for feature specifications

### 4. Development Workflow
```bash
# 1. Implement feature
# 2. Write tests
# 3. Run tests
pytest tests/test_credit_scoring.py -v

# 4. Format code
black src/ tests/

# 5. Check types
mypy src/

# 6. Lint
flake8 src/ tests/
```

## X402 Protocol Integration

The x402 protocol integration can be implemented in phases:

### Phase 1: Mock Implementation
- Return 402 for paid endpoints
- Accept any payment proof (for testing)
- Log payment attempts

### Phase 2: Locus Integration
- Integrate Locus SDK
- Verify payments with Locus API
- Handle payment failures

### Phase 3: Production Ready
- Secure payment verification
- Rate limiting
- Monitoring and logging

## Testing Strategy

### Unit Tests
- Credit scoring algorithm
- Payment validation
- Data model validation
- Configuration loading

### Integration Tests
- Database operations
- API endpoints (without payment)
- Error handling

### E2E Tests
- Complete payment report flow
- Credit score queries with payment
- Payment history retrieval

## Common Issues & Solutions

### MongoDB Connection Fails
- Check MongoDB is running: `mongo --eval 'db.runCommand({ ping: 1 })'`
- Verify `MONGODB_URI` in `.env`
- Check network/firewall settings

### Import Errors
- Ensure virtual environment is activated
- Run `pip install -r requirements.txt`
- Check Python version (3.9+)

### API Returns 500 Errors
- Check server logs for stack trace
- Verify MongoDB connection
- Ensure `.env` is properly configured

## Resources

### Documentation
- [REQUIREMENTS.md](REQUIREMENTS.md) - What to build
- [ARCHITECTURE.md](ARCHITECTURE.md) - How it's designed
- [API_SPEC.md](API_SPEC.md) - API details
- [README.md](README.md) - User guide

### External Resources
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [MongoDB Motor Documentation](https://motor.readthedocs.io/)
- [X402 Protocol](https://x402.gitbook.io/x402)
- [Locus Documentation](https://docs.paywithlocus.com/)

## Support

If you encounter issues:
1. Check the documentation in this directory
2. Review the error logs
3. Verify configuration in `.env`
4. Test MongoDB connection separately
5. Check Python and package versions

## Summary

You now have:
- ✅ Complete planning and requirements
- ✅ System architecture designed
- ✅ API specification documented
- ✅ Project structure set up
- ✅ Configuration management ready
- ✅ Data models defined
- 🔨 Ready to implement core functionality

Next: Start implementing the database layer, then services, then API routes!
