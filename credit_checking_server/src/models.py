"""
Data models for the Credit Checking Server.

Defines Pydantic models for request/response validation and MongoDB document schemas.
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, field_validator, model_validator
import hashlib
from uuid import uuid4


# ============================================================================
# Enums and Constants
# ============================================================================

PaymentStatus = Literal["on_time", "late", "defaulted"]
PaymentRole = Literal["all", "payer", "payee"]


# ============================================================================
# MongoDB Document Models
# ============================================================================

class Agent(BaseModel):
    """
    Agent profile stored in MongoDB.

    Represents a payment agent with their credit history.
    """
    wallet_address: str = Field(..., description="Unique wallet address (primary key)")
    credit_score: int = Field(default=70, ge=0, le=100, description="Current credit score")
    last_updated: datetime = Field(default_factory=datetime.utcnow, description="Last score update")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Agent creation timestamp")
    total_payments_made: int = Field(default=0, ge=0, description="Total payments as payer")
    total_payments_received: int = Field(default=0, ge=0, description="Total payments as payee")

    @field_validator("wallet_address")
    @classmethod
    def validate_wallet_address(cls, v: str) -> str:
        """Validate wallet address format (flexible for testing)."""
        if not v.startswith("0x"):
            raise ValueError("Wallet address must start with '0x'")
        if len(v) < 3:  # Must have at least 0x + 1 character
            raise ValueError("Wallet address must have at least 3 characters (0x + identifier)")
        # Accept alphanumeric and underscores for flexible testing
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "wallet_address": "0x1234567890abcdef1234567890abcdef12345678",
                "credit_score": 85,
                "last_updated": "2025-11-15T10:00:00Z",
                "created_at": "2025-11-01T00:00:00Z",
                "total_payments_made": 20,
                "total_payments_received": 22
            }
        }


class PaymentEvent(BaseModel):
    """
    Individual payment event stored in MongoDB.

    Represents a single payment transaction between two agents.
    """
    event_id: str = Field(..., description="Unique event identifier")
    payer_wallet: str = Field(..., description="Wallet address of payer")
    payee_wallet: str = Field(..., description="Wallet address of payee")
    amount: Decimal = Field(..., gt=0, description="Payment amount")
    currency: str = Field(default="USD", description="Currency code")
    due_date: datetime = Field(..., description="When payment was due")
    payment_date: Optional[datetime] = Field(None, description="When payment was made")
    status: PaymentStatus = Field(..., description="Payment status")
    days_overdue: int = Field(default=0, ge=0, description="Days overdue (0 if on time)")
    reported_at: datetime = Field(default_factory=datetime.utcnow, description="When event was reported")
    reporter_wallet: str = Field(..., description="Wallet of agent who reported")

    @field_validator("payer_wallet", "payee_wallet", "reporter_wallet")
    @classmethod
    def validate_wallet(cls, v: str) -> str:
        """Validate wallet address format (flexible for testing)."""
        if not v.startswith("0x"):
            raise ValueError("Wallet address must start with '0x'")
        if len(v) < 3:
            raise ValueError("Wallet address must have at least 3 characters (0x + identifier)")
        return v

    @model_validator(mode='after')
    def validate_payment_logic(self) -> 'PaymentEvent':
        """Validate payment status logic."""
        # Payer and payee must be different
        if self.payer_wallet == self.payee_wallet:
            raise ValueError("Payer and payee must be different")

        # Validate payment_date based on status
        if self.status in ["on_time", "late"] and self.payment_date is None:
            raise ValueError(f"payment_date is required when status is '{self.status}'")

        if self.status == "defaulted" and self.payment_date is not None:
            raise ValueError("payment_date must be None when status is 'defaulted'")

        # Validate on_time status
        if self.status == "on_time" and self.payment_date:
            if self.payment_date > self.due_date:
                raise ValueError("payment_date must be <= due_date when status is 'on_time'")
            self.days_overdue = 0

        # Validate late status
        if self.status == "late" and self.payment_date:
            if self.payment_date <= self.due_date:
                raise ValueError("payment_date must be > due_date when status is 'late'")
            # Calculate days overdue
            self.days_overdue = (self.payment_date - self.due_date).days

        # Validate defaulted status
        if self.status == "defaulted":
            # Calculate days overdue from due_date to now
            self.days_overdue = max(0, (datetime.utcnow() - self.due_date).days)

        return self

    class Config:
        json_schema_extra = {
            "example": {
                "event_id": "evt_abc123xyz",
                "payer_wallet": "0x1234567890abcdef1234567890abcdef12345678",
                "payee_wallet": "0xfedcba0987654321fedcba0987654321fedcba09",
                "amount": "150.00",
                "currency": "USD",
                "due_date": "2025-11-10T00:00:00Z",
                "payment_date": "2025-11-09T15:30:00Z",
                "status": "on_time",
                "days_overdue": 0,
                "reported_at": "2025-11-09T15:31:00Z",
                "reporter_wallet": "0xfedcba0987654321fedcba0987654321fedcba09"
            }
        }


# ============================================================================
# Request Models (API Input)
# ============================================================================

class ReportPaymentRequest(BaseModel):
    """Request body for reporting a payment event."""
    payer_wallet: str = Field(..., description="Wallet address of payer")
    payee_wallet: str = Field(..., description="Wallet address of payee")
    amount: Decimal = Field(..., gt=0, description="Payment amount")
    currency: str = Field(default="USD", description="Currency code")
    due_date: datetime = Field(..., description="When payment was due")
    payment_date: Optional[datetime] = Field(None, description="When payment was made (omit if defaulted)")
    status: PaymentStatus = Field(..., description="Payment status: on_time, late, or defaulted")

    @field_validator("payer_wallet", "payee_wallet")
    @classmethod
    def validate_wallet(cls, v: str) -> str:
        """Validate wallet address format (flexible for testing)."""
        if not v.startswith("0x"):
            raise ValueError("Wallet address must start with '0x'")
        if len(v) < 3:
            raise ValueError("Wallet address must have at least 3 characters (0x + identifier)")
        return v

    @model_validator(mode='after')
    def validate_payment_data(self) -> 'ReportPaymentRequest':
        """Validate payment logic."""
        if self.payer_wallet == self.payee_wallet:
            raise ValueError("Payer and payee must be different")

        if self.status in ["on_time", "late"] and self.payment_date is None:
            raise ValueError(f"payment_date is required when status is '{self.status}'")

        if self.status == "defaulted" and self.payment_date is not None:
            raise ValueError("payment_date must be omitted when status is 'defaulted'")

        if self.status == "on_time" and self.payment_date:
            if self.payment_date > self.due_date:
                raise ValueError("payment_date must be on or before due_date for on_time status")

        if self.status == "late" and self.payment_date:
            if self.payment_date <= self.due_date:
                raise ValueError("payment_date must be after due_date for late status")

        return self

    def to_payment_event(self, reporter_wallet: str) -> PaymentEvent:
        """Convert request to PaymentEvent with generated event_id."""
        # Generate deterministic event_id for idempotency
        event_id = self.generate_event_id()

        # Calculate days overdue
        days_overdue = 0
        if self.status == "late" and self.payment_date:
            days_overdue = (self.payment_date - self.due_date).days
        elif self.status == "defaulted":
            days_overdue = max(0, (datetime.utcnow() - self.due_date).days)

        return PaymentEvent(
            event_id=event_id,
            payer_wallet=self.payer_wallet,
            payee_wallet=self.payee_wallet,
            amount=self.amount,
            currency=self.currency,
            due_date=self.due_date,
            payment_date=self.payment_date,
            status=self.status,
            days_overdue=days_overdue,
            reporter_wallet=reporter_wallet
        )

    def generate_event_id(self) -> str:
        """
        Generate deterministic event ID for idempotency.

        Based on payer, payee, amount, and due_date.
        """
        data = f"{self.payer_wallet}{self.payee_wallet}{self.amount}{self.due_date.isoformat()}"
        hash_digest = hashlib.sha256(data.encode()).hexdigest()[:16]
        return f"evt_{hash_digest}"

    class Config:
        json_schema_extra = {
            "example": {
                "payer_wallet": "0x1234567890abcdef1234567890abcdef12345678",
                "payee_wallet": "0xfedcba0987654321fedcba0987654321fedcba09",
                "amount": "150.00",
                "due_date": "2025-11-10T00:00:00Z",
                "payment_date": "2025-11-09T15:30:00Z",
                "status": "on_time"
            }
        }


# ============================================================================
# Response Models (API Output)
# ============================================================================

class CreditScoreResponse(BaseModel):
    """Response for credit score query."""
    agent_id: str = Field(..., description="Wallet address of agent")
    credit_score: int = Field(..., ge=0, le=100, description="Credit score (0-100)")
    last_updated: datetime = Field(..., description="Last score calculation timestamp")
    payments_count: int = Field(..., ge=0, description="Total payment events")
    is_new_agent: bool = Field(..., description="True if agent has no history")

    class Config:
        json_schema_extra = {
            "example": {
                "agent_id": "0x1234567890abcdef1234567890abcdef12345678",
                "credit_score": 85,
                "last_updated": "2025-11-15T10:00:00Z",
                "payments_count": 42,
                "is_new_agent": False
            }
        }


class PaymentHistoryResponse(BaseModel):
    """Response for payment history query."""
    agent_id: str = Field(..., description="Wallet address of agent")
    total_count: int = Field(..., ge=0, description="Total payment events")
    page: int = Field(..., ge=1, description="Current page number")
    page_size: int = Field(..., ge=1, description="Events per page")
    total_pages: int = Field(..., ge=0, description="Total number of pages")
    payments: List[PaymentEvent] = Field(..., description="Payment events for this page")

    class Config:
        json_schema_extra = {
            "example": {
                "agent_id": "0x1234567890abcdef1234567890abcdef12345678",
                "total_count": 42,
                "page": 1,
                "page_size": 50,
                "total_pages": 1,
                "payments": [
                    {
                        "event_id": "evt_abc123xyz",
                        "payer_wallet": "0x1234567890abcdef1234567890abcdef12345678",
                        "payee_wallet": "0xfedcba0987654321fedcba0987654321fedcba09",
                        "amount": "150.00",
                        "currency": "USD",
                        "due_date": "2025-11-10T00:00:00Z",
                        "payment_date": "2025-11-09T15:30:00Z",
                        "status": "on_time",
                        "days_overdue": 0,
                        "reported_at": "2025-11-09T15:31:00Z",
                        "reporter_wallet": "0xfedcba0987654321fedcba0987654321fedcba09"
                    }
                ]
            }
        }


class ReportPaymentResponse(BaseModel):
    """Response for payment report submission."""
    event_id: str = Field(..., description="Unique event identifier")
    message: str = Field(..., description="Confirmation message")
    payer_wallet: str = Field(..., description="Wallet address of payer")
    payee_wallet: str = Field(..., description="Wallet address of payee")
    amount: Decimal = Field(..., description="Payment amount")
    status: PaymentStatus = Field(..., description="Payment status")
    days_overdue: int = Field(..., description="Days overdue")
    reported_at: datetime = Field(..., description="When event was recorded")
    credit_score_updated: bool = Field(..., description="Whether scores were recalculated")
    new_credit_scores: dict = Field(..., description="Updated credit scores")

    class Config:
        json_schema_extra = {
            "example": {
                "event_id": "evt_abc123xyz",
                "message": "Payment event recorded successfully",
                "payer_wallet": "0x1234567890abcdef1234567890abcdef12345678",
                "payee_wallet": "0xfedcba0987654321fedcba0987654321fedcba09",
                "amount": "150.00",
                "status": "on_time",
                "days_overdue": 0,
                "reported_at": "2025-11-15T10:00:00Z",
                "credit_score_updated": True,
                "new_credit_scores": {
                    "payer": 87,
                    "payee": 72
                }
            }
        }


class HealthResponse(BaseModel):
    """Response for health check endpoint."""
    status: str = Field(..., description="Service status")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Current server time")
    version: str = Field(default="1.0.0", description="API version")

    class Config:
        json_schema_extra = {
            "example": {
                "status": "healthy",
                "timestamp": "2025-11-15T10:00:00Z",
                "version": "1.0.0"
            }
        }


class ErrorResponse(BaseModel):
    """Standard error response format."""
    error: str = Field(..., description="Error code")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[dict] = Field(None, description="Additional error details")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Error timestamp")

    class Config:
        json_schema_extra = {
            "example": {
                "error": "validation_error",
                "message": "Invalid request data",
                "details": {
                    "payment_date": "Payment date must be after due date for late status"
                },
                "timestamp": "2025-11-15T10:00:00Z"
            }
        }


class PaymentRequiredResponse(BaseModel):
    """Response for 402 Payment Required."""
    error: str = Field(default="payment_required", description="Error code")
    message: str = Field(..., description="Error message")
    payment_details: dict = Field(..., description="Payment information")
    instructions: str = Field(..., description="Instructions for making payment")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Timestamp")

    class Config:
        json_schema_extra = {
            "example": {
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
        }
