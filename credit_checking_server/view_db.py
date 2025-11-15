#!/usr/bin/env python3
"""
View MongoDB database contents for Credit Checking Server.
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import json


async def view_database():
    """View all collections and documents in the database."""

    # Connect to MongoDB
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["credit_checking"]

    print("=" * 80)
    print(" CREDIT CHECKING SERVER - DATABASE VIEWER")
    print("=" * 80)

    # List all collections
    collections = await db.list_collection_names()
    print(f"\n📊 Collections in database: {collections}")

    # View agents collection
    print("\n" + "=" * 80)
    print(" AGENTS COLLECTION")
    print("=" * 80)

    agents_count = await db.agents.count_documents({})
    print(f"\nTotal agents: {agents_count}")

    if agents_count > 0:
        print("\nAgent Details:")
        print("-" * 80)

        cursor = db.agents.find({})
        async for agent in cursor:
            # Convert ObjectId to string for display
            agent["_id"] = str(agent["_id"])

            print(f"\n📍 Wallet: {agent.get('wallet_address')}")
            print(f"   Credit Score: {agent.get('credit_score')}")
            print(f"   Payments Made: {agent.get('total_payments_made', 0)}")
            print(f"   Payments Received: {agent.get('total_payments_received', 0)}")
            print(f"   Created: {agent.get('created_at')}")
            print(f"   Last Updated: {agent.get('last_updated')}")
            print(f"   Full document: {json.dumps(agent, indent=2, default=str)}")
    else:
        print("\n⚠️  No agents found in database")

    # View payment_events collection
    print("\n" + "=" * 80)
    print(" PAYMENT EVENTS COLLECTION")
    print("=" * 80)

    events_count = await db.payment_events.count_documents({})
    print(f"\nTotal payment events: {events_count}")

    if events_count > 0:
        print("\nPayment Event Details:")
        print("-" * 80)

        # Get events sorted by most recent first
        cursor = db.payment_events.find({}).sort("reported_at", -1)

        async for event in cursor:
            # Convert ObjectId to string for display
            event["_id"] = str(event["_id"])

            print(f"\n💰 Event ID: {event.get('event_id')}")
            print(f"   Payer: {event.get('payer_wallet')}")
            print(f"   Payee: {event.get('payee_wallet')}")
            print(f"   Amount: ${event.get('amount')} {event.get('currency', 'USD')}")
            print(f"   Status: {event.get('status')}")
            print(f"   Due Date: {event.get('due_date')}")
            print(f"   Payment Date: {event.get('payment_date')}")
            print(f"   Days Overdue: {event.get('days_overdue', 0)}")
            print(f"   Reporter: {event.get('reporter_wallet')}")
            print(f"   Reported At: {event.get('reported_at')}")
            print(f"   Full document: {json.dumps(event, indent=2, default=str)}")
    else:
        print("\n⚠️  No payment events found in database")

    # Summary statistics
    print("\n" + "=" * 80)
    print(" SUMMARY STATISTICS")
    print("=" * 80)

    # Count by status
    if events_count > 0:
        print("\n📈 Payment Events by Status:")
        for status in ["on_time", "late", "defaulted"]:
            count = await db.payment_events.count_documents({"status": status})
            if count > 0:
                print(f"   {status}: {count}")

        # Average credit score
        pipeline = [
            {"$group": {
                "_id": None,
                "avg_score": {"$avg": "$credit_score"},
                "min_score": {"$min": "$credit_score"},
                "max_score": {"$max": "$credit_score"}
            }}
        ]

        async for result in db.agents.aggregate(pipeline):
            print(f"\n📊 Credit Score Statistics:")
            print(f"   Average: {result.get('avg_score', 0):.2f}")
            print(f"   Min: {result.get('min_score', 0)}")
            print(f"   Max: {result.get('max_score', 0)}")

    print("\n" + "=" * 80)
    print(" Database view complete!")
    print("=" * 80)

    client.close()


async def view_agent_detail(wallet_address: str):
    """View detailed information for a specific agent."""

    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["credit_checking"]

    print("=" * 80)
    print(f" AGENT DETAIL: {wallet_address}")
    print("=" * 80)

    # Get agent
    agent = await db.agents.find_one({"wallet_address": wallet_address})

    if not agent:
        print(f"\n⚠️  Agent not found: {wallet_address}")
        client.close()
        return

    agent["_id"] = str(agent["_id"])

    print("\n📍 Agent Information:")
    print(json.dumps(agent, indent=2, default=str))

    # Get all payment events for this agent
    print("\n💰 Payment Events (as payer):")
    payer_events = await db.payment_events.count_documents({"payer_wallet": wallet_address})
    print(f"   Total: {payer_events}")

    if payer_events > 0:
        cursor = db.payment_events.find({"payer_wallet": wallet_address}).sort("reported_at", -1)
        async for event in cursor:
            print(f"   - {event.get('status')}: ${event.get('amount')} to {event.get('payee_wallet')[:10]}...")

    print("\n💰 Payment Events (as payee):")
    payee_events = await db.payment_events.count_documents({"payee_wallet": wallet_address})
    print(f"   Total: {payee_events}")

    if payee_events > 0:
        cursor = db.payment_events.find({"payee_wallet": wallet_address}).sort("reported_at", -1)
        async for event in cursor:
            print(f"   - {event.get('status')}: ${event.get('amount')} from {event.get('payer_wallet')[:10]}...")

    client.close()


async def clear_database():
    """Clear all data from the database (use with caution!)."""

    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["credit_checking"]

    print("⚠️  WARNING: This will delete all data from the database!")
    print("=" * 80)

    # Count documents
    agents_count = await db.agents.count_documents({})
    events_count = await db.payment_events.count_documents({})

    print(f"\nThis will delete:")
    print(f"  - {agents_count} agents")
    print(f"  - {events_count} payment events")

    confirm = input("\nType 'DELETE' to confirm: ")

    if confirm == "DELETE":
        await db.agents.delete_many({})
        await db.payment_events.delete_many({})
        print("\n✅ Database cleared successfully!")
    else:
        print("\n❌ Operation cancelled")

    client.close()


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="View MongoDB database contents")
    parser.add_argument(
        "--agent",
        help="View details for specific agent wallet address"
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Clear all data from database (requires confirmation)"
    )

    args = parser.parse_args()

    if args.clear:
        asyncio.run(clear_database())
    elif args.agent:
        asyncio.run(view_agent_detail(args.agent))
    else:
        asyncio.run(view_database())


if __name__ == "__main__":
    main()
