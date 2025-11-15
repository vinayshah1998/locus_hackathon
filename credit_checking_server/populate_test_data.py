#!/usr/bin/env python3
"""
Populate test data for Credit Checking Server.

Creates realistic payment scenarios to test the credit scoring algorithm.
"""

import requests
from datetime import datetime, timedelta
import random

BASE_URL = "http://localhost:8000"

# Test agents
AGENTS = {
    "alice": "0x1111111111111111111111111111111111111111",
    "bob": "0x2222222222222222222222222222222222222222",
    "charlie": "0x3333333333333333333333333333333333333333",
    "david": "0x4444444444444444444444444444444444444444",
    "eve": "0x5555555555555555555555555555555555555555",
}

REPORTER = "0x9999999999999999999999999999999999999999"


def report_payment(payer, payee, amount, days_late=0, defaulted=False):
    """Report a payment event."""

    due_date = datetime.utcnow() - timedelta(days=days_late if days_late > 0 else 1)

    if defaulted:
        status = "defaulted"
        payment_date = None
    elif days_late > 0:
        status = "late"
        payment_date = datetime.utcnow()
    else:
        status = "on_time"
        payment_date = due_date - timedelta(hours=random.randint(1, 48))

    payload = {
        "payer_wallet": payer,
        "payee_wallet": payee,
        "amount": str(amount),
        "due_date": due_date.isoformat() + "Z",
        "status": status
    }

    if payment_date:
        payload["payment_date"] = payment_date.isoformat() + "Z"

    headers = {
        "X-Agent-Wallet": REPORTER,
        "Content-Type": "application/json"
    }

    response = requests.post(
        f"{BASE_URL}/report-payment",
        headers=headers,
        json=payload
    )

    return response


def main():
    """Populate test data."""

    print("=" * 80)
    print(" POPULATING TEST DATA")
    print("=" * 80)

    scenarios = [
        # Alice: Good payment history (should have high score)
        ("alice", "bob", 100, 0, False, "Alice pays Bob on time"),
        ("alice", "charlie", 150, 0, False, "Alice pays Charlie on time"),
        ("alice", "david", 200, 0, False, "Alice pays David on time"),
        ("alice", "eve", 175, 0, False, "Alice pays Eve on time"),
        ("alice", "bob", 125, 0, False, "Alice pays Bob again on time"),

        # Bob: Mixed payment history (moderate score)
        ("bob", "charlie", 100, 0, False, "Bob pays Charlie on time"),
        ("bob", "david", 150, 5, False, "Bob pays David late (5 days)"),
        ("bob", "eve", 200, 0, False, "Bob pays Eve on time"),
        ("bob", "alice", 100, 3, False, "Bob pays Alice late (3 days)"),

        # Charlie: Some late payments (lower score)
        ("charlie", "david", 100, 0, False, "Charlie pays David on time"),
        ("charlie", "eve", 150, 10, False, "Charlie pays Eve late (10 days)"),
        ("charlie", "alice", 200, 15, False, "Charlie pays Alice late (15 days)"),
        ("charlie", "bob", 175, 0, False, "Charlie pays Bob on time"),

        # David: Poor payment history (low score)
        ("david", "eve", 100, 20, False, "David pays Eve late (20 days)"),
        ("david", "alice", 150, 35, False, "David pays Alice late (35 days)"),
        ("david", "bob", 200, 0, False, "David pays Bob on time"),
        ("david", "charlie", 175, 40, False, "David pays Charlie late (40 days)"),

        # Eve: Very poor, with defaults (very low score)
        ("eve", "alice", 100, 0, True, "Eve defaults on payment to Alice"),
        ("eve", "bob", 150, 25, False, "Eve pays Bob late (25 days)"),
        ("eve", "charlie", 200, 0, True, "Eve defaults on payment to Charlie"),
        ("eve", "david", 175, 50, False, "Eve pays David late (50 days)"),
    ]

    print(f"\nCreating {len(scenarios)} payment events...")
    print("-" * 80)

    for payer_name, payee_name, amount, days_late, defaulted, description in scenarios:
        payer = AGENTS[payer_name]
        payee = AGENTS[payee_name]

        print(f"\n{description}")
        response = report_payment(payer, payee, amount, days_late, defaulted)

        if response.status_code == 201:
            data = response.json()
            payer_score = data.get("new_credit_scores", {}).get("payer", "N/A")
            print(f"  ✅ Recorded | {payer_name}'s new score: {payer_score}")
        elif response.status_code == 409:
            print(f"  ⚠️  Duplicate (already exists)")
        else:
            print(f"  ❌ Failed: {response.status_code}")

    print("\n" + "=" * 80)
    print(" Querying final credit scores...")
    print("=" * 80)

    for name, wallet in AGENTS.items():
        response = requests.get(
            f"{BASE_URL}/credit-score/{wallet}",
            headers={
                "X-Agent-Wallet": REPORTER,
                "X-402-Payment-Proof": "test_proof",
                "X-402-Amount": "0.002",
                "X-402-Signature": "test_sig"
            }
        )

        if response.status_code == 200:
            data = response.json()
            score = data.get("credit_score")
            payments = data.get("payments_count")
            is_new = data.get("is_new_agent")

            # Colorize score
            if score >= 75:
                status = "🟢 Excellent"
            elif score >= 65:
                status = "🟡 Good"
            elif score >= 55:
                status = "🟠 Fair"
            else:
                status = "🔴 Poor"

            print(f"\n{name.capitalize():10} | Score: {score:5.1f} | Payments: {payments:2} | {status}")

    print("\n" + "=" * 80)
    print(" Test data populated successfully!")
    print("=" * 80)
    print("\nView the data with:")
    print("  python view_db.py")
    print("  python view_db.py --agent <wallet_address>")


if __name__ == "__main__":
    main()
