#!/usr/bin/env python3
"""
Populate test data for Agent Alice (0xAGENT_ALICE_WALLET_001).
Creates a diverse payment history to test credit scoring.
"""

import requests
from datetime import datetime, timedelta
import random

BASE_URL = "http://localhost:8000"

# Alice's wallet address
ALICE = "0xAGENT_ALICE_WALLET_001"

# Other test agents
BOB = "0xAGENT_BOB_WALLET_002"
CHARLIE = "0xAGENT_CHARLIE_WALLET_003"
DAVID = "0xAGENT_DAVID_WALLET_004"
EVE = "0xAGENT_EVE_WALLET_005"

REPORTER = "0xREPORTER_WALLET_999"


def report_payment(payer, payee, amount, days_late=0, defaulted=False, days_ago=30):
    """Report a payment event."""

    # Calculate due date (some time in the past)
    due_date = datetime.utcnow() - timedelta(days=days_ago)

    if defaulted:
        status = "defaulted"
        payment_date = None
    elif days_late > 0:
        status = "late"
        payment_date = due_date + timedelta(days=days_late)
    else:
        status = "on_time"
        # Pay 1-2 days before due date
        payment_date = due_date - timedelta(hours=random.randint(24, 48))

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
    """Populate test data for Alice."""

    print("=" * 80)
    print(" POPULATING TEST DATA FOR ALICE")
    print(f" Wallet: {ALICE}")
    print("=" * 80)

    scenarios = [
        # Alice as PAYER - mostly good payment history
        (ALICE, BOB, 150.00, 0, False, 60, "Alice pays Bob $150 on time (60 days ago)"),
        (ALICE, CHARLIE, 250.50, 0, False, 55, "Alice pays Charlie $250.50 on time (55 days ago)"),
        (ALICE, DAVID, 100.00, 0, False, 50, "Alice pays David $100 on time (50 days ago)"),
        (ALICE, EVE, 175.25, 0, False, 45, "Alice pays Eve $175.25 on time (45 days ago)"),
        (ALICE, BOB, 200.00, 0, False, 40, "Alice pays Bob $200 on time (40 days ago)"),
        (ALICE, CHARLIE, 125.75, 0, False, 35, "Alice pays Charlie $125.75 on time (35 days ago)"),
        (ALICE, DAVID, 300.00, 0, False, 30, "Alice pays David $300 on time (30 days ago)"),

        # A couple late payments
        (ALICE, BOB, 180.00, 4, False, 25, "Alice pays Bob $180 late by 4 days (25 days ago)"),
        (ALICE, EVE, 220.50, 6, False, 20, "Alice pays Eve $220.50 late by 6 days (20 days ago)"),

        # More on-time payments (building good history)
        (ALICE, CHARLIE, 95.00, 0, False, 15, "Alice pays Charlie $95 on time (15 days ago)"),
        (ALICE, DAVID, 310.25, 0, False, 10, "Alice pays David $310.25 on time (10 days ago)"),
        (ALICE, BOB, 275.00, 0, False, 5, "Alice pays Bob $275 on time (5 days ago)"),

        # Alice as PAYEE - receiving payments from others
        (BOB, ALICE, 500.00, 0, False, 55, "Bob pays Alice $500 on time"),
        (CHARLIE, ALICE, 350.00, 3, False, 50, "Charlie pays Alice $350 late by 3 days"),
        (DAVID, ALICE, 425.75, 0, False, 45, "David pays Alice $425.75 on time"),
        (EVE, ALICE, 150.00, 10, False, 40, "Eve pays Alice $150 late by 10 days"),
        (BOB, ALICE, 200.00, 0, False, 30, "Bob pays Alice $200 on time"),
        (CHARLIE, ALICE, 175.50, 0, False, 20, "Charlie pays Alice $175.50 on time"),
        (DAVID, ALICE, 300.00, 0, False, 10, "David pays Alice $300 on time"),
    ]

    print(f"\nCreating {len(scenarios)} payment events for Alice...")
    print("-" * 80)

    success_count = 0
    duplicate_count = 0
    error_count = 0

    for payer, payee, amount, days_late, defaulted, days_ago, description in scenarios:
        print(f"\n{description}")
        response = report_payment(payer, payee, amount, days_late, defaulted, days_ago)

        if response.status_code == 201:
            data = response.json()
            alice_score = data.get("new_credit_scores", {}).get("payer" if payer == ALICE else "payee", "N/A")
            print(f"  ✅ Recorded | Alice's new score: {alice_score}")
            success_count += 1
        elif response.status_code == 409:
            print(f"  ⚠️  Duplicate (already exists)")
            duplicate_count += 1
        else:
            print(f"  ❌ Failed: {response.status_code} - {response.text}")
            error_count += 1

    print("\n" + "=" * 80)
    print(" SUMMARY")
    print("=" * 80)
    print(f"✅ Successfully created: {success_count}")
    print(f"⚠️  Duplicates skipped: {duplicate_count}")
    print(f"❌ Errors: {error_count}")

    # Query Alice's final credit score
    print("\n" + "=" * 80)
    print(" ALICE'S FINAL CREDIT SCORE")
    print("=" * 80)

    response = requests.get(
        f"{BASE_URL}/credit-score/{ALICE}",
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
        last_updated = data.get("last_updated")

        # Colorize score
        if score >= 75:
            status = "🟢 Excellent"
        elif score >= 65:
            status = "🟡 Good"
        elif score >= 55:
            status = "🟠 Fair"
        else:
            status = "🔴 Poor"

        print(f"\nWallet Address: {ALICE}")
        print(f"Credit Score:   {score:.1f}/100")
        print(f"Status:         {status}")
        print(f"Total Payments: {payments}")
        print(f"Is New Agent:   {is_new}")
        print(f"Last Updated:   {last_updated}")
    else:
        print(f"\n❌ Failed to retrieve credit score: {response.status_code}")
        print(response.text)

    # Query Alice's payment history
    print("\n" + "=" * 80)
    print(" ALICE'S PAYMENT HISTORY")
    print("=" * 80)

    response = requests.get(
        f"{BASE_URL}/payment-history/{ALICE}",
        headers={
            "X-Agent-Wallet": REPORTER,
            "X-402-Payment-Proof": "test_proof",
            "X-402-Amount": "0.001",
            "X-402-Signature": "test_sig"
        }
    )

    if response.status_code == 200:
        data = response.json()
        payments = data.get("payments", [])
        total_count = data.get("total_count", 0)

        print(f"\nTotal payment events: {total_count}")
        print("\nRecent payments (showing first 10):")
        print("-" * 80)

        for i, payment in enumerate(payments[:10], 1):
            role = "PAID" if payment["payer_wallet"] == ALICE else "RECEIVED"
            counterparty = payment["payee_wallet"] if role == "PAID" else payment["payer_wallet"]
            status_icon = "✅" if payment["status"] == "on_time" else "⚠️" if payment["status"] == "late" else "❌"

            print(f"\n{i}. {status_icon} {role} ${payment['amount']} {payment['status'].upper()}")
            print(f"   Counterparty: {counterparty}")
            print(f"   Due: {payment['due_date']}")
            if payment.get('payment_date'):
                print(f"   Paid: {payment['payment_date']}")
            if payment['days_overdue'] > 0:
                print(f"   Days overdue: {payment['days_overdue']}")
    else:
        print(f"\n❌ Failed to retrieve payment history: {response.status_code}")

    print("\n" + "=" * 80)
    print(" Test data populated successfully!")
    print("=" * 80)


if __name__ == "__main__":
    main()
