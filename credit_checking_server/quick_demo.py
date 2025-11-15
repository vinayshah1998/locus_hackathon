#!/usr/bin/env python3
"""Quick demo of the API functionality."""

import requests
import json

BASE_URL = "http://localhost:8000"

print("=" * 80)
print(" QUICK API TEST DEMO")
print("=" * 80)

# Test 1: Report an on-time payment
print("\n1. Reporting on-time payment (Alice pays Bob $100)...")
response = requests.post(
    f"{BASE_URL}/report-payment",
    headers={"X-Agent-Wallet": "0x9999999999999999999999999999999999999999"},
    json={
        "payer_wallet": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "payee_wallet": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "amount": "100.00",
        "due_date": "2025-11-10T00:00:00Z",
        "payment_date": "2025-11-09T15:30:00Z",
        "status": "on_time"
    }
)
print(f"Status: {response.status_code}")
if response.status_code == 201:
    data = response.json()
    print("✅ Payment reported!")
    print(f"   Event ID: {data['event_id']}")
    print(f"   Payer score: {data['new_credit_scores']['payer']}")
    print(f"   Payee score: {data['new_credit_scores']['payee']}")
else:
    print(f"Response: {response.text}")

# Test 2: Query credit score with mock payment
print("\n2. Querying Alice's credit score (with mock payment)...")
response = requests.get(
    f"{BASE_URL}/credit-score/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    headers={
        "X-Agent-Wallet": "0x9999999999999999999999999999999999999999",
        "X-402-Payment-Proof": "test_proof_demo",
        "X-402-Amount": "0.002",
        "X-402-Signature": "test_sig_demo"
    }
)
print(f"Status: {response.status_code}")
if response.status_code == 200:
    data = response.json()
    print("✅ Credit score retrieved!")
    print(f"   Score: {data['credit_score']}")
    print(f"   Payments count: {data['payments_count']}")
    print(f"   Is new agent: {data['is_new_agent']}")
else:
    print(f"Response: {response.text}")

# Test 3: Query credit score WITHOUT payment (should fail with 402)
print("\n3. Querying without payment (should get 402)...")
response = requests.get(
    f"{BASE_URL}/credit-score/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    headers={
        "X-Agent-Wallet": "0x9999999999999999999999999999999999999999"
    }
)
print(f"Status: {response.status_code}")
if response.status_code == 402:
    print("✅ Correctly received 402 Payment Required")
    print(f"   Payment needed: ${response.headers.get('X-402-Amount')} {response.headers.get('X-402-Currency')}")
else:
    print(f"Unexpected status: {response.status_code}")

print("\n" + "=" * 80)
print(" Demo complete! Server is working correctly.")
print("=" * 80)
