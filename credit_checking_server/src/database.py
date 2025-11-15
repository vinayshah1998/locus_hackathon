"""
Database connection and initialization for MongoDB.

Manages Motor async MongoDB client connection and provides database access.
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from typing import Optional
import structlog

from .config import settings

logger = structlog.get_logger(__name__)


class Database:
    """
    MongoDB database manager with async Motor driver.

    Handles connection lifecycle and provides database access.
    """

    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None

    @classmethod
    async def connect(cls) -> None:
        """
        Connect to MongoDB and initialize database.

        Creates indexes for optimal query performance.
        """
        try:
            logger.info(
                "connecting_to_mongodb",
                uri=settings.mongodb_uri.split("@")[-1],  # Hide credentials
                database=settings.mongodb_db
            )

            # Create Motor client
            cls.client = AsyncIOMotorClient(
                settings.mongodb_connection_string,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000
            )

            # Get database reference
            cls.db = cls.client[settings.mongodb_db]

            # Test connection
            await cls.client.admin.command('ping')

            # Create indexes
            await cls.create_indexes()

            logger.info(
                "mongodb_connected",
                database=settings.mongodb_db
            )

        except Exception as e:
            logger.error(
                "mongodb_connection_failed",
                error=str(e),
                uri=settings.mongodb_uri.split("@")[-1]
            )
            raise

    @classmethod
    async def disconnect(cls) -> None:
        """
        Close MongoDB connection.
        """
        if cls.client:
            logger.info("disconnecting_from_mongodb")
            cls.client.close()
            cls.client = None
            cls.db = None
            logger.info("mongodb_disconnected")

    @classmethod
    async def create_indexes(cls) -> None:
        """
        Create database indexes for optimal query performance.
        """
        if cls.db is None:
            raise RuntimeError("Database not connected")

        logger.info("creating_database_indexes")

        # Agents collection indexes
        agents_collection = cls.db.agents
        await agents_collection.create_index("wallet_address", unique=True)
        await agents_collection.create_index("credit_score")

        # Payment events collection indexes
        payment_events_collection = cls.db.payment_events
        await payment_events_collection.create_index("event_id", unique=True)
        await payment_events_collection.create_index("payer_wallet")
        await payment_events_collection.create_index("payee_wallet")
        await payment_events_collection.create_index("status")
        await payment_events_collection.create_index("due_date")
        await payment_events_collection.create_index("reported_at")

        # Compound indexes for common queries
        await payment_events_collection.create_index([("payer_wallet", 1), ("status", 1)])
        await payment_events_collection.create_index([("payee_wallet", 1), ("status", 1)])

        logger.info("database_indexes_created")

    @classmethod
    def get_database(cls) -> AsyncIOMotorDatabase:
        """
        Get the database instance.

        Returns:
            AsyncIOMotorDatabase instance

        Raises:
            RuntimeError if database not connected
        """
        if cls.db is None:
            raise RuntimeError("Database not connected. Call Database.connect() first")
        return cls.db


# Convenience function for FastAPI dependency injection
async def get_db() -> AsyncIOMotorDatabase:
    """
    Get database instance for FastAPI dependency injection.

    Usage in route:
        @app.get("/endpoint")
        async def endpoint(db: AsyncIOMotorDatabase = Depends(get_db)):
            ...
    """
    return Database.get_database()


__all__ = ["Database", "get_db"]
