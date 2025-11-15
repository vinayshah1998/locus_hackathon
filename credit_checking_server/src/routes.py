"""
API routes for the Credit Checking Server.

Defines all API endpoints with request/response handling.
"""

from fastapi import APIRouter, Depends, Request, Header, HTTPException, status
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
import structlog

from .database import get_db
from .models import (
    CreditScoreResponse,
    PaymentHistoryResponse,
    ReportPaymentRequest,
    ReportPaymentResponse,
    HealthResponse,
    ErrorResponse,
    PaymentRole
)
from .services.agent_service import AgentService
from .services.payment_service import PaymentService
from .services.x402_handler import X402Handler, X402PaymentRequiredError, get_x402_handler
from .config import settings

logger = structlog.get_logger(__name__)

# Create router
router = APIRouter()


# ============================================================================
# Helper Functions
# ============================================================================

def get_wallet_from_header(x_agent_wallet: Optional[str] = Header(None)) -> str:
    """
    Extract and validate wallet address from request header.

    Args:
        x_agent_wallet: Wallet address from X-Agent-Wallet header

    Returns:
        Validated wallet address

    Raises:
        HTTPException if wallet address is missing or invalid
    """
    if not x_agent_wallet:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "unauthorized",
                "message": "Missing X-Agent-Wallet header",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        )

    # Validate format (flexible for testing)
    if not x_agent_wallet.startswith("0x") or len(x_agent_wallet) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "invalid_wallet",
                "message": "Invalid wallet address format",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        )

    return x_agent_wallet


# ============================================================================
# Health Check Endpoint
# ============================================================================

@router.get(
    "/health",
    response_model=HealthResponse,
    tags=["System"],
    summary="Health check",
    description="Check if the server is running and healthy"
)
async def health_check() -> HealthResponse:
    """
    Health check endpoint.

    Returns server status and version information.
    """
    return HealthResponse(
        status="healthy",
        timestamp=datetime.utcnow(),
        version="1.0.0"
    )


# ============================================================================
# Credit Score Endpoint (Paid - $0.002)
# ============================================================================

@router.get(
    "/credit-score/{agent_id}",
    response_model=CreditScoreResponse,
    responses={
        200: {"description": "Credit score retrieved successfully"},
        402: {
            "description": "Payment required",
            "model": ErrorResponse
        },
        400: {"description": "Invalid wallet address"},
        404: {"description": "Agent not found (returns default score)"}
    },
    tags=["Credit Scoring"],
    summary="Get credit score for an agent",
    description="Retrieve the credit score for a specific agent. Requires x402 payment of $0.002 USD."
)
async def get_credit_score(
    agent_id: str,
    request: Request,
    wallet: str = Depends(get_wallet_from_header),
    db: AsyncIOMotorDatabase = Depends(get_db),
    x402: X402Handler = Depends(get_x402_handler)
) -> CreditScoreResponse:
    """
    Get credit score for an agent.

    Args:
        agent_id: Wallet address of agent to query
        request: FastAPI request object
        wallet: Requester's wallet address (from header)
        db: Database instance
        x402: X402 payment handler

    Returns:
        CreditScoreResponse with credit score and metadata

    Raises:
        X402PaymentRequiredError if payment is missing/invalid
        HTTPException for invalid wallet address
    """
    # Verify payment
    x402.require_payment(
        request=request,
        amount=settings.credit_score_price,
        endpoint=f"/credit-score/{agent_id}"
    )

    # Validate agent_id format (flexible for testing)
    if not agent_id.startswith("0x") or len(agent_id) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "invalid_wallet",
                "message": "Invalid wallet address format for agent_id",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        )

    logger.info(
        "credit_score_requested",
        agent_id=agent_id,
        requester=wallet
    )

    # Get credit score
    agent_service = AgentService(db)
    credit_data = await agent_service.get_credit_score(agent_id)

    return CreditScoreResponse(**credit_data)


# ============================================================================
# Payment History Endpoint (Paid - $0.001)
# ============================================================================

@router.get(
    "/payment-history/{agent_id}",
    response_model=PaymentHistoryResponse,
    responses={
        200: {"description": "Payment history retrieved successfully"},
        402: {
            "description": "Payment required",
            "model": ErrorResponse
        },
        400: {"description": "Invalid parameters"},
        404: {"description": "Agent not found (returns empty history)"}
    },
    tags=["Payment History"],
    summary="Get payment history for an agent",
    description="Retrieve complete payment history for a specific agent. Requires x402 payment of $0.001 USD."
)
async def get_payment_history(
    agent_id: str,
    request: Request,
    page: int = 1,
    page_size: int = 50,
    role: PaymentRole = "all",
    status: Optional[str] = None,
    wallet: str = Depends(get_wallet_from_header),
    db: AsyncIOMotorDatabase = Depends(get_db),
    x402: X402Handler = Depends(get_x402_handler)
) -> PaymentHistoryResponse:
    """
    Get payment history for an agent.

    Args:
        agent_id: Wallet address of agent to query
        request: FastAPI request object
        page: Page number (1-indexed)
        page_size: Number of events per page (max 200)
        role: Filter by role (all, payer, payee)
        status: Optional status filter (on_time, late, defaulted)
        wallet: Requester's wallet address (from header)
        db: Database instance
        x402: X402 payment handler

    Returns:
        PaymentHistoryResponse with paginated payment events

    Raises:
        X402PaymentRequiredError if payment is missing/invalid
        HTTPException for invalid parameters
    """
    # Verify payment
    x402.require_payment(
        request=request,
        amount=settings.payment_history_price,
        endpoint=f"/payment-history/{agent_id}"
    )

    # Validate agent_id format (flexible for testing)
    if not agent_id.startswith("0x") or len(agent_id) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "invalid_wallet",
                "message": "Invalid wallet address format for agent_id",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        )

    # Validate pagination parameters
    if page < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "invalid_parameter",
                "message": "Page must be >= 1",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        )

    if page_size < 1 or page_size > 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "invalid_parameter",
                "message": "Page size must be between 1 and 200",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        )

    # Validate status if provided
    if status and status not in ["on_time", "late", "defaulted"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "invalid_parameter",
                "message": "Status must be one of: on_time, late, defaulted",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        )

    logger.info(
        "payment_history_requested",
        agent_id=agent_id,
        requester=wallet,
        page=page,
        page_size=page_size,
        role=role
    )

    # Get payment history
    payment_service = PaymentService(db)
    history_data = await payment_service.get_payment_history_paginated(
        wallet_address=agent_id,
        page=page,
        page_size=page_size,
        role=role,
        status=status
    )

    return PaymentHistoryResponse(**history_data)


# ============================================================================
# Report Payment Endpoint (Free)
# ============================================================================

@router.post(
    "/report-payment",
    response_model=ReportPaymentResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Payment event recorded successfully"},
        400: {"description": "Invalid request data"},
        401: {"description": "Missing or invalid wallet address"},
        409: {"description": "Duplicate event"}
    },
    tags=["Payment Reporting"],
    summary="Report a payment event",
    description="Report a payment event to update credit history. This endpoint is free."
)
async def report_payment(
    payment_data: ReportPaymentRequest,
    wallet: str = Depends(get_wallet_from_header),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> ReportPaymentResponse:
    """
    Report a payment event.

    Args:
        payment_data: Payment event details
        wallet: Reporter's wallet address (from header)
        db: Database instance

    Returns:
        ReportPaymentResponse with confirmation and updated credit scores

    Raises:
        HTTPException for validation errors or duplicates
    """
    logger.info(
        "payment_report_received",
        reporter=wallet,
        payer=payment_data.payer_wallet,
        payee=payment_data.payee_wallet,
        amount=str(payment_data.amount),
        status=payment_data.status
    )

    try:
        # Create payment event
        payment_service = PaymentService(db)
        payment_event = await payment_service.create_payment_event(
            payer_wallet=payment_data.payer_wallet,
            payee_wallet=payment_data.payee_wallet,
            amount=payment_data.amount,
            due_date=payment_data.due_date,
            payment_date=payment_data.payment_date,
            status=payment_data.status,
            reporter_wallet=wallet,
            currency=payment_data.currency
        )

        # Update agent payment counts
        agent_service = AgentService(db)
        await agent_service.increment_payment_counts(
            payer_wallet=payment_data.payer_wallet,
            payee_wallet=payment_data.payee_wallet
        )

        # Update payer's credit score
        payer_score = await agent_service.update_credit_score(payment_data.payer_wallet)

        # Get payee's credit score (don't update, just retrieve)
        payee_data = await agent_service.get_credit_score(payment_data.payee_wallet)
        payee_score = payee_data["credit_score"]

        logger.info(
            "payment_event_recorded",
            event_id=payment_event.event_id,
            payer_score=payer_score,
            payee_score=payee_score
        )

        return ReportPaymentResponse(
            event_id=payment_event.event_id,
            message="Payment event recorded successfully",
            payer_wallet=payment_event.payer_wallet,
            payee_wallet=payment_event.payee_wallet,
            amount=payment_event.amount,
            status=payment_event.status,
            days_overdue=payment_event.days_overdue,
            reported_at=payment_event.reported_at,
            credit_score_updated=True,
            new_credit_scores={
                "payer": payer_score,
                "payee": payee_score
            }
        )

    except ValueError as e:
        # Duplicate event
        if "already exists" in str(e):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "error": "duplicate_event",
                    "message": str(e),
                    "timestamp": datetime.utcnow().isoformat() + "Z"
                }
            )
        # Other validation errors
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "validation_error",
                "message": str(e),
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        )


# Export router
__all__ = ["router"]
