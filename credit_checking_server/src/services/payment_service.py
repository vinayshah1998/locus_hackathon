"""
Payment service for managing payment history.

Handles payment event storage, retrieval, and querying.
"""

from typing import List, Optional, Literal
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
from decimal import Decimal
import hashlib
import structlog

from ..models import PaymentEvent, PaymentRole
from .credit_scoring import CreditScoringService

logger = structlog.get_logger(__name__)


class PaymentService:
    """
    Service for managing payment events and history.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        """
        Initialize payment service.

        Args:
            db: MongoDB database instance
        """
        self.db = db
        self.collection = db.payment_events
        self.credit_scoring = CreditScoringService()

    @staticmethod
    def generate_event_id(
        payer_wallet: str,
        payee_wallet: str,
        amount: Decimal,
        due_date: datetime
    ) -> str:
        """
        Generate deterministic event ID for idempotency.

        Args:
            payer_wallet: Wallet address of payer
            payee_wallet: Wallet address of payee
            amount: Payment amount
            due_date: Payment due date

        Returns:
            Event ID string (evt_<hash>)
        """
        # Create deterministic hash from payment details
        data = f"{payer_wallet.lower()}{payee_wallet.lower()}{amount}{due_date.isoformat()}"
        hash_digest = hashlib.sha256(data.encode()).hexdigest()[:16]
        return f"evt_{hash_digest}"

    async def create_payment_event(
        self,
        payer_wallet: str,
        payee_wallet: str,
        amount: Decimal,
        due_date: datetime,
        payment_date: Optional[datetime],
        status: str,
        reporter_wallet: str,
        currency: str = "USD"
    ) -> PaymentEvent:
        """
        Create a new payment event.

        Args:
            payer_wallet: Wallet address of payer
            payee_wallet: Wallet address of payee
            amount: Payment amount
            due_date: When payment was due
            payment_date: When payment was made (None if defaulted)
            status: Payment status (on_time, late, defaulted)
            reporter_wallet: Wallet address of reporter
            currency: Currency code

        Returns:
            Created PaymentEvent

        Raises:
            ValueError if duplicate event
        """
        # Normalize wallet addresses
        payer_wallet = payer_wallet.lower()
        payee_wallet = payee_wallet.lower()
        reporter_wallet = reporter_wallet.lower()

        # Generate event ID
        event_id = self.generate_event_id(payer_wallet, payee_wallet, amount, due_date)

        # Check for duplicate
        existing = await self.collection.find_one({"event_id": event_id})
        if existing:
            logger.warning(
                "duplicate_payment_event",
                event_id=event_id,
                payer=payer_wallet,
                payee=payee_wallet
            )
            raise ValueError(f"Payment event already exists: {event_id}")

        # Calculate days overdue
        days_overdue = self.credit_scoring.calculate_days_overdue(due_date, payment_date)

        # Create payment event
        payment_event = PaymentEvent(
            event_id=event_id,
            payer_wallet=payer_wallet,
            payee_wallet=payee_wallet,
            amount=amount,
            currency=currency,
            due_date=due_date,
            payment_date=payment_date,
            status=status,
            days_overdue=days_overdue,
            reported_at=datetime.utcnow(),
            reporter_wallet=reporter_wallet
        )

        # Store in database (convert Decimal to string for MongoDB)
        event_dict = payment_event.model_dump()
        event_dict["amount"] = str(event_dict["amount"])

        await self.collection.insert_one(event_dict)

        logger.info(
            "payment_event_created",
            event_id=event_id,
            payer=payer_wallet,
            payee=payee_wallet,
            amount=str(amount),
            status=status
        )

        return payment_event

    async def get_payment_event(self, event_id: str) -> Optional[PaymentEvent]:
        """
        Get payment event by ID.

        Args:
            event_id: Event identifier

        Returns:
            PaymentEvent if found, None otherwise
        """
        event_doc = await self.collection.find_one({"event_id": event_id})

        if not event_doc:
            return None

        # Convert amount back to Decimal
        event_doc["amount"] = Decimal(event_doc["amount"])

        return PaymentEvent(**event_doc)

    async def get_agent_payments(
        self,
        wallet_address: str,
        role: PaymentRole = "all",
        status: Optional[str] = None
    ) -> List[PaymentEvent]:
        """
        Get all payment events for an agent.

        Args:
            wallet_address: Agent's wallet address
            role: Filter by role (all, payer, payee)
            status: Optional status filter (on_time, late, defaulted)

        Returns:
            List of PaymentEvent objects
        """
        wallet_address = wallet_address.lower()

        # Build query
        query = {}

        if role == "payer":
            query["payer_wallet"] = wallet_address
        elif role == "payee":
            query["payee_wallet"] = wallet_address
        else:  # "all"
            query["$or"] = [
                {"payer_wallet": wallet_address},
                {"payee_wallet": wallet_address}
            ]

        if status:
            query["status"] = status

        # Fetch events, sorted by reported_at (newest first)
        cursor = self.collection.find(query).sort("reported_at", -1)
        events = []

        async for event_doc in cursor:
            # Convert amount back to Decimal
            event_doc["amount"] = Decimal(event_doc["amount"])
            events.append(PaymentEvent(**event_doc))

        logger.debug(
            "agent_payments_retrieved",
            wallet_address=wallet_address,
            role=role,
            count=len(events)
        )

        return events

    async def get_payment_history_paginated(
        self,
        wallet_address: str,
        page: int = 1,
        page_size: int = 50,
        role: PaymentRole = "all",
        status: Optional[str] = None
    ) -> dict:
        """
        Get paginated payment history for an agent.

        Args:
            wallet_address: Agent's wallet address
            page: Page number (1-indexed)
            page_size: Number of events per page
            role: Filter by role (all, payer, payee)
            status: Optional status filter

        Returns:
            Dictionary with pagination metadata and payment events
        """
        wallet_address = wallet_address.lower()

        # Build query
        query = {}

        if role == "payer":
            query["payer_wallet"] = wallet_address
        elif role == "payee":
            query["payee_wallet"] = wallet_address
        else:  # "all"
            query["$or"] = [
                {"payer_wallet": wallet_address},
                {"payee_wallet": wallet_address}
            ]

        if status:
            query["status"] = status

        # Get total count
        total_count = await self.collection.count_documents(query)

        # Calculate pagination
        total_pages = (total_count + page_size - 1) // page_size  # Ceiling division
        skip = (page - 1) * page_size

        # Fetch paginated events
        cursor = self.collection.find(query).sort("reported_at", -1).skip(skip).limit(page_size)
        events = []

        async for event_doc in cursor:
            # Convert amount back to Decimal
            event_doc["amount"] = Decimal(event_doc["amount"])
            events.append(PaymentEvent(**event_doc))

        logger.debug(
            "payment_history_retrieved",
            wallet_address=wallet_address,
            page=page,
            page_size=page_size,
            total_count=total_count
        )

        return {
            "agent_id": wallet_address,
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "payments": events
        }


__all__ = ["PaymentService"]
