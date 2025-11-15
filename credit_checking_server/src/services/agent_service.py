"""
Agent service for managing agent data and credit scores.

Handles agent CRUD operations and credit score retrieval.
"""

from typing import Optional
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import structlog

from ..models import Agent
from ..config import settings
from .credit_scoring import CreditScoringService
from .payment_service import PaymentService

logger = structlog.get_logger(__name__)


class AgentService:
    """
    Service for managing agent data and credit scores.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        """
        Initialize agent service.

        Args:
            db: MongoDB database instance
        """
        self.db = db
        self.collection = db.agents
        self.credit_scoring = CreditScoringService()
        self.payment_service = PaymentService(db)

    async def get_agent(self, wallet_address: str) -> Optional[Agent]:
        """
        Get agent by wallet address.

        Args:
            wallet_address: Agent's wallet address

        Returns:
            Agent if found, None otherwise
        """
        # Normalize wallet address to lowercase
        wallet_address = wallet_address.lower()

        agent_doc = await self.collection.find_one({"wallet_address": wallet_address})

        if not agent_doc:
            return None

        return Agent(**agent_doc)

    async def create_agent(self, wallet_address: str) -> Agent:
        """
        Create a new agent with default credit score.

        Args:
            wallet_address: Agent's wallet address

        Returns:
            Created Agent
        """
        # Normalize wallet address to lowercase
        wallet_address = wallet_address.lower()

        agent = Agent(
            wallet_address=wallet_address,
            credit_score=settings.default_credit_score,
            created_at=datetime.utcnow(),
            last_updated=datetime.utcnow()
        )

        await self.collection.insert_one(agent.model_dump())

        logger.info(
            "agent_created",
            wallet_address=wallet_address,
            credit_score=agent.credit_score
        )

        return agent

    async def get_or_create_agent(self, wallet_address: str) -> Agent:
        """
        Get agent by wallet address, creating if doesn't exist.

        Args:
            wallet_address: Agent's wallet address

        Returns:
            Agent (existing or newly created)
        """
        agent = await self.get_agent(wallet_address)
        if not agent:
            agent = await self.create_agent(wallet_address)
        return agent

    async def update_credit_score(self, wallet_address: str) -> int:
        """
        Recalculate and update agent's credit score.

        Args:
            wallet_address: Agent's wallet address

        Returns:
            Updated credit score
        """
        # Normalize wallet address
        wallet_address = wallet_address.lower()

        # Get all payment events for this agent (as payer)
        payment_events = await self.payment_service.get_agent_payments(
            wallet_address,
            role="payer"
        )

        # Calculate new credit score
        new_score = self.credit_scoring.calculate_credit_score(payment_events)

        # Update agent in database
        await self.collection.update_one(
            {"wallet_address": wallet_address},
            {
                "$set": {
                    "credit_score": new_score,
                    "last_updated": datetime.utcnow(),
                    "total_payments_made": len(payment_events)
                }
            },
            upsert=True
        )

        logger.info(
            "credit_score_updated",
            wallet_address=wallet_address,
            credit_score=new_score,
            payment_count=len(payment_events)
        )

        return new_score

    async def get_credit_score(self, wallet_address: str) -> dict:
        """
        Get agent's credit score with metadata.

        Args:
            wallet_address: Agent's wallet address

        Returns:
            Dictionary with credit score and metadata
        """
        agent = await self.get_or_create_agent(wallet_address)

        # If agent is new (just created), return default score
        is_new_agent = agent.total_payments_made == 0 and agent.total_payments_received == 0

        return {
            "agent_id": agent.wallet_address,
            "credit_score": agent.credit_score,
            "last_updated": agent.last_updated,
            "payments_count": agent.total_payments_made,
            "is_new_agent": is_new_agent
        }

    async def increment_payment_counts(
        self,
        payer_wallet: str,
        payee_wallet: str
    ) -> None:
        """
        Increment payment counters for payer and payee.

        Args:
            payer_wallet: Wallet address of payer
            payee_wallet: Wallet address of payee
        """
        # Normalize addresses
        payer_wallet = payer_wallet.lower()
        payee_wallet = payee_wallet.lower()

        # Increment payer's payment made count
        await self.collection.update_one(
            {"wallet_address": payer_wallet},
            {"$inc": {"total_payments_made": 1}},
            upsert=True
        )

        # Increment payee's payment received count
        await self.collection.update_one(
            {"wallet_address": payee_wallet},
            {"$inc": {"total_payments_received": 1}},
            upsert=True
        )

        logger.debug(
            "payment_counts_incremented",
            payer=payer_wallet,
            payee=payee_wallet
        )


__all__ = ["AgentService"]
