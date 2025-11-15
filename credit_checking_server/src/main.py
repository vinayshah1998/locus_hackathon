"""
Main FastAPI application for the Credit Checking Server.

Entry point for the API server with startup/shutdown event handlers.
"""

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
from datetime import datetime
import structlog

from .config import settings
from .database import Database
from .routes import router
from .services.x402_handler import X402PaymentRequiredError

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer() if settings.log_format == "json"
        else structlog.dev.ConsoleRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger(__name__)


# ============================================================================
# Lifespan Context Manager (Startup/Shutdown)
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.

    Handles database connection/disconnection and other initialization.
    """
    # Startup
    logger.info(
        "starting_credit_checking_server",
        version="1.0.0",
        environment=settings.env,
        port=settings.server_port
    )

    try:
        # Connect to MongoDB
        await Database.connect()
        logger.info("server_startup_complete")

        yield

    finally:
        # Shutdown
        logger.info("shutting_down_server")
        await Database.disconnect()
        logger.info("server_shutdown_complete")


# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="Credit Checking Server",
    description=(
        "API service for payment agent creditworthiness verification. "
        "Provides credit scores and payment history with x402 payment protocol."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# ============================================================================
# CORS Middleware
# ============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Exception Handlers
# ============================================================================

@app.exception_handler(X402PaymentRequiredError)
async def payment_required_handler(request: Request, exc: X402PaymentRequiredError):
    """
    Handle 402 Payment Required errors with proper headers.
    """
    logger.info(
        "payment_required_response",
        endpoint=exc.endpoint,
        amount=str(exc.amount)
    )

    return JSONResponse(
        status_code=402,
        content=exc.detail,
        headers={
            "X-402-Amount": str(exc.amount),
            "X-402-Currency": exc.currency,
            "X-402-Address": settings.locus_wallet_address
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Handle Pydantic validation errors with detailed messages.
    """
    errors = {}
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"] if loc != "body")
        errors[field] = error["msg"]

    logger.warning(
        "validation_error",
        path=request.url.path,
        errors=errors
    )

    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "error": "validation_error",
            "message": "Invalid request data",
            "details": errors,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """
    Handle unexpected errors with generic 500 response.
    """
    logger.error(
        "internal_server_error",
        path=request.url.path,
        error=str(exc),
        exc_info=True
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "internal_error",
            "message": "An internal server error occurred",
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    )


# ============================================================================
# Include Routes
# ============================================================================

app.include_router(router)


# ============================================================================
# Root Endpoint
# ============================================================================

@app.get(
    "/",
    tags=["System"],
    summary="API Information",
    description="Get basic API information and links to documentation"
)
async def root():
    """
    Root endpoint with API information.
    """
    return {
        "service": "Credit Checking Server",
        "version": "1.0.0",
        "description": "Creditworthiness verification API for payment agents",
        "documentation": {
            "swagger_ui": "/docs",
            "redoc": "/redoc",
            "openapi_schema": "/openapi.json"
        },
        "endpoints": {
            "health": "/health",
            "credit_score": "/credit-score/{agent_id}",
            "payment_history": "/payment-history/{agent_id}",
            "report_payment": "/report-payment"
        },
        "protocol": "x402",
        "pricing": {
            "credit_score": f"${settings.credit_score_price} USD",
            "payment_history": f"${settings.payment_history_price} USD",
            "report_payment": "Free"
        }
    }


# ============================================================================
# Middleware for Request Logging
# ============================================================================

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """
    Log all incoming requests and responses.
    """
    # Log request
    logger.info(
        "request_received",
        method=request.method,
        path=request.url.path,
        client=request.client.host if request.client else None
    )

    # Process request
    response = await call_next(request)

    # Log response
    logger.info(
        "request_completed",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code
    )

    return response


# ============================================================================
# Export
# ============================================================================

__all__ = ["app"]
