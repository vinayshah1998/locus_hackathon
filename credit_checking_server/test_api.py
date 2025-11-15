#!/usr/bin/env python3
"""
Comprehensive API test script for Credit Checking Server.

Tests all endpoints with realistic scenarios demonstrating the credit scoring algorithm.
"""

import requests
import json
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, Any


class CreditServerTester:
    """Test harness for Credit Checking Server API."""

    def __init__(self, base_url: str = "http://localhost:8000"):
        """
        Initialize tester.

        Args:
            base_url: Base URL of the API server
        """
        self.base_url = base_url
        self.session = requests.Session()

        # Test wallet addresses
        self.alice_wallet = "0x1111111111111111111111111111111111111111"
        self.bob_wallet = "0x2222222222222222222222222222222222222222"
        self.charlie_wallet = "0x3333333333333333333333333333333333333333"
        self.reporter_wallet = "0x9999999999999999999999999999999999999999"

    def print_section(self, title: str):
        """Print a section header."""
        print("\n" + "=" * 80)
        print(f" {title}")
        print("=" * 80)

    def print_response(self, response: requests.Response):
        """Pretty print response."""
        print(f"\nStatus: {response.status_code}")
        print(f"Headers: {dict(response.headers)}")
        try:
            print(f"Body: {json.dumps(response.json(), indent=2)}")
        except:
            print(f"Body: {response.text}")

    def test_health_check(self):
        """Test health check endpoint."""
        self.print_section("1. Testing Health Check Endpoint")

        response = self.session.get(f"{self.base_url}/health")
        self.print_response(response)

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("\n✅ Health check passed!")

    def test_root_endpoint(self):
        """Test root endpoint."""
        self.print_section("2. Testing Root Endpoint (API Info)")

        response = self.session.get(f"{self.base_url}/")
        self.print_response(response)

        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "Credit Checking Server"
        print("\n✅ Root endpoint passed!")

    def report_payment(
        self,
        payer: str,
        payee: str,
        amount: float,
        status: str,
        days_late: int = 0,
        reporter: str = None
    ) -> Dict[str, Any]:
        """
        Report a payment event.

        Args:
            payer: Payer wallet address
            payee: Payee wallet address
            amount: Payment amount
            status: Payment status (on_time, late, defaulted)
            days_late: Days late (if applicable)
            reporter: Reporter wallet (defaults to payee)

        Returns:
            Response JSON
        """
        if reporter is None:
            reporter = payee

        # Calculate dates
        due_date = datetime.utcnow() - timedelta(days=days_late)
        payment_date = None if status == "defaulted" else datetime.utcnow()

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
            "X-Agent-Wallet": reporter,
            "Content-Type": "application/json"
        }

        response = self.session.post(
            f"{self.base_url}/report-payment",
            headers=headers,
            json=payload
        )

        return response

    def get_credit_score(
        self,
        agent_id: str,
        requester: str = None,
        use_mock_payment: bool = True
    ) -> requests.Response:
        """
        Get credit score for an agent.

        Args:
            agent_id: Agent wallet to query
            requester: Requester wallet (defaults to reporter_wallet)
            use_mock_payment: Whether to include mock payment headers

        Returns:
            Response object
        """
        if requester is None:
            requester = self.reporter_wallet

        headers = {"X-Agent-Wallet": requester}

        if use_mock_payment:
            headers.update({
                "X-402-Payment-Proof": "test_proof_abc123",
                "X-402-Amount": "0.002",
                "X-402-Signature": "test_signature_xyz789"
            })

        response = self.session.get(
            f"{self.base_url}/credit-score/{agent_id}",
            headers=headers
        )

        return response

    def get_payment_history(
        self,
        agent_id: str,
        requester: str = None,
        use_mock_payment: bool = True,
        **params
    ) -> requests.Response:
        """
        Get payment history for an agent.

        Args:
            agent_id: Agent wallet to query
            requester: Requester wallet (defaults to reporter_wallet)
            use_mock_payment: Whether to include mock payment headers
            **params: Query parameters (page, page_size, role, status)

        Returns:
            Response object
        """
        if requester is None:
            requester = self.reporter_wallet

        headers = {"X-Agent-Wallet": requester}

        if use_mock_payment:
            headers.update({
                "X-402-Payment-Proof": "test_proof_abc123",
                "X-402-Amount": "0.001",
                "X-402-Signature": "test_signature_xyz789"
            })

        response = self.session.get(
            f"{self.base_url}/payment-history/{agent_id}",
            headers=headers,
            params=params
        )

        return response

    def test_payment_reporting(self):
        """Test payment reporting endpoint with various scenarios."""
        self.print_section("3. Testing Payment Reporting (Free Endpoint)")

        scenarios = [
            {
                "name": "Alice pays Bob on time - $100",
                "payer": self.alice_wallet,
                "payee": self.bob_wallet,
                "amount": 100.0,
                "status": "on_time",
                "days_late": 0
            },
            {
                "name": "Bob pays Charlie on time - $50",
                "payer": self.bob_wallet,
                "payee": self.charlie_wallet,
                "amount": 50.0,
                "status": "on_time",
                "days_late": 0
            },
            {
                "name": "Charlie pays Alice late (5 days) - $75",
                "payer": self.charlie_wallet,
                "payee": self.alice_wallet,
                "amount": 75.0,
                "status": "late",
                "days_late": 5
            },
            {
                "name": "Alice pays Bob on time again - $150",
                "payer": self.alice_wallet,
                "payee": self.bob_wallet,
                "amount": 150.0,
                "status": "on_time",
                "days_late": 0
            },
            {
                "name": "Bob pays Alice late (10 days) - $200",
                "payer": self.bob_wallet,
                "payee": self.alice_wallet,
                "amount": 200.0,
                "status": "late",
                "days_late": 10
            }
        ]

        for scenario in scenarios:
            print(f"\n--- {scenario['name']} ---")
            response = self.report_payment(
                payer=scenario["payer"],
                payee=scenario["payee"],
                amount=scenario["amount"],
                status=scenario["status"],
                days_late=scenario["days_late"]
            )

            self.print_response(response)

            if response.status_code == 201:
                data = response.json()
                print(f"\n✅ Payment reported successfully!")
                print(f"   Event ID: {data.get('event_id')}")
                print(f"   Payer new score: {data.get('new_credit_scores', {}).get('payer')}")
                print(f"   Payee new score: {data.get('new_credit_scores', {}).get('payee')}")
            else:
                print(f"\n❌ Failed to report payment")

    def test_credit_score_queries(self):
        """Test credit score queries."""
        self.print_section("4. Testing Credit Score Queries (Paid Endpoint)")

        agents = [
            ("Alice", self.alice_wallet),
            ("Bob", self.bob_wallet),
            ("Charlie", self.charlie_wallet)
        ]

        for name, wallet in agents:
            print(f"\n--- Querying {name}'s Credit Score ---")

            # First try without payment (should get 402)
            print("\n🔸 Attempt 1: Without payment headers")
            response = self.get_credit_score(wallet, use_mock_payment=False)
            self.print_response(response)

            if response.status_code == 402:
                print("\n✅ Correctly received 402 Payment Required")

            # Now try with mock payment
            print("\n🔸 Attempt 2: With mock payment headers")
            response = self.get_credit_score(wallet, use_mock_payment=True)
            self.print_response(response)

            if response.status_code == 200:
                data = response.json()
                print(f"\n✅ Credit score retrieved successfully!")
                print(f"   Score: {data.get('credit_score')}")
                print(f"   Payments count: {data.get('payments_count')}")
                print(f"   Is new agent: {data.get('is_new_agent')}")
            else:
                print(f"\n❌ Failed to retrieve credit score")

    def test_payment_history_queries(self):
        """Test payment history queries."""
        self.print_section("5. Testing Payment History Queries (Paid Endpoint)")

        # Test Alice's payment history
        print("\n--- Alice's Payment History (All Roles) ---")
        response = self.get_payment_history(
            self.alice_wallet,
            use_mock_payment=True,
            role="all"
        )
        self.print_response(response)

        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ Payment history retrieved!")
            print(f"   Total payments: {data.get('total_count')}")
            print(f"   Showing page {data.get('page')} of {data.get('total_pages')}")

        # Test Bob's payment history (as payer only)
        print("\n--- Bob's Payment History (As Payer Only) ---")
        response = self.get_payment_history(
            self.bob_wallet,
            use_mock_payment=True,
            role="payer"
        )
        self.print_response(response)

        # Test Charlie's late payments
        print("\n--- Charlie's Late Payments ---")
        response = self.get_payment_history(
            self.charlie_wallet,
            use_mock_payment=True,
            status="late"
        )
        self.print_response(response)

    def test_new_agent_default_score(self):
        """Test that new agents get default credit score of 70."""
        self.print_section("6. Testing New Agent Default Score")

        new_agent = "0x4444444444444444444444444444444444444444"

        print(f"\n--- Querying credit score for new agent: {new_agent} ---")
        response = self.get_credit_score(new_agent, use_mock_payment=True)
        self.print_response(response)

        if response.status_code == 200:
            data = response.json()
            if data.get("credit_score") == 70 and data.get("is_new_agent"):
                print("\n✅ New agent correctly received default score of 70!")
            else:
                print(f"\n❌ Unexpected score or is_new_agent flag")

    def test_validation_errors(self):
        """Test validation error handling."""
        self.print_section("7. Testing Validation Errors")

        # Test 1: Invalid wallet address format
        print("\n--- Test: Invalid wallet address ---")
        response = self.get_credit_score(
            "invalid_address",
            use_mock_payment=True
        )
        self.print_response(response)
        assert response.status_code == 400
        print("\n✅ Correctly rejected invalid wallet address")

        # Test 2: Missing wallet header
        print("\n--- Test: Missing X-Agent-Wallet header ---")
        response = self.session.get(f"{self.base_url}/credit-score/{self.alice_wallet}")
        self.print_response(response)
        assert response.status_code == 401
        print("\n✅ Correctly rejected missing wallet header")

        # Test 3: Same payer and payee
        print("\n--- Test: Same payer and payee ---")
        response = self.report_payment(
            payer=self.alice_wallet,
            payee=self.alice_wallet,
            amount=100.0,
            status="on_time"
        )
        self.print_response(response)
        assert response.status_code == 400
        print("\n✅ Correctly rejected same payer and payee")

        # Test 4: Negative amount
        print("\n--- Test: Negative amount ---")
        headers = {
            "X-Agent-Wallet": self.reporter_wallet,
            "Content-Type": "application/json"
        }
        payload = {
            "payer_wallet": self.alice_wallet,
            "payee_wallet": self.bob_wallet,
            "amount": "-50.0",
            "due_date": datetime.utcnow().isoformat() + "Z",
            "payment_date": datetime.utcnow().isoformat() + "Z",
            "status": "on_time"
        }
        response = self.session.post(
            f"{self.base_url}/report-payment",
            headers=headers,
            json=payload
        )
        self.print_response(response)
        assert response.status_code == 400
        print("\n✅ Correctly rejected negative amount")

    def test_credit_scoring_algorithm(self):
        """Test credit scoring algorithm with controlled scenarios."""
        self.print_section("8. Testing Credit Scoring Algorithm")

        # Create a dedicated test agent
        test_agent = "0x5555555555555555555555555555555555555555"
        counterparty = "0x6666666666666666666666666666666666666666"

        print(f"\n--- Starting credit: 70 (default) ---")

        # Scenario 1: Multiple on-time payments (should increase score)
        print("\n🔸 Reporting 5 on-time payments (+0.5 each = +2.5 total)")
        for i in range(5):
            response = self.report_payment(
                payer=test_agent,
                payee=counterparty,
                amount=100.0,
                status="on_time"
            )
            if response.status_code == 201:
                new_score = response.json().get("new_credit_scores", {}).get("payer")
                print(f"   Payment {i+1}: Score = {new_score}")

        # Check final score
        response = self.get_credit_score(test_agent, use_mock_payment=True)
        if response.status_code == 200:
            score = response.json().get("credit_score")
            print(f"\n   Expected: ~72.5, Actual: {score}")
            if abs(score - 72.5) < 0.1:
                print("   ✅ On-time payment bonus working correctly!")

        # Scenario 2: Late payment (1-7 days) should decrease by 2
        print("\n🔸 Reporting 1 late payment (5 days, -2 points)")
        response = self.report_payment(
            payer=test_agent,
            payee=counterparty,
            amount=100.0,
            status="late",
            days_late=5
        )
        if response.status_code == 201:
            new_score = response.json().get("new_credit_scores", {}).get("payer")
            print(f"   New score: {new_score}")
            print(f"   Expected: ~70.5, Actual: {new_score}")

        # Scenario 3: Late payment (8-30 days) should decrease by 5
        print("\n🔸 Reporting 1 late payment (15 days, -5 points)")
        response = self.report_payment(
            payer=test_agent,
            payee=counterparty,
            amount=100.0,
            status="late",
            days_late=15
        )
        if response.status_code == 201:
            new_score = response.json().get("new_credit_scores", {}).get("payer")
            print(f"   New score: {new_score}")
            print(f"   Expected: ~65.5, Actual: {new_score}")

    def run_all_tests(self):
        """Run all tests in sequence."""
        print("\n" + "🚀" * 40)
        print(" CREDIT CHECKING SERVER - COMPREHENSIVE API TEST SUITE")
        print("🚀" * 40)

        try:
            self.test_health_check()
            self.test_root_endpoint()
            self.test_payment_reporting()
            self.test_credit_score_queries()
            self.test_payment_history_queries()
            self.test_new_agent_default_score()
            self.test_validation_errors()
            self.test_credit_scoring_algorithm()

            print("\n" + "✅" * 40)
            print(" ALL TESTS COMPLETED!")
            print("✅" * 40)

        except AssertionError as e:
            print(f"\n❌ Test failed: {e}")
        except requests.exceptions.ConnectionError:
            print("\n❌ Connection failed. Is the server running on http://localhost:8000?")
        except Exception as e:
            print(f"\n❌ Unexpected error: {e}")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Test Credit Checking Server API")
    parser.add_argument(
        "--url",
        default="http://localhost:8000",
        help="Base URL of the API server (default: http://localhost:8000)"
    )
    parser.add_argument(
        "--test",
        choices=[
            "health", "root", "payment", "credit", "history",
            "new_agent", "validation", "algorithm", "all"
        ],
        default="all",
        help="Specific test to run (default: all)"
    )

    args = parser.parse_args()

    tester = CreditServerTester(base_url=args.url)

    if args.test == "all":
        tester.run_all_tests()
    elif args.test == "health":
        tester.test_health_check()
    elif args.test == "root":
        tester.test_root_endpoint()
    elif args.test == "payment":
        tester.test_payment_reporting()
    elif args.test == "credit":
        tester.test_credit_score_queries()
    elif args.test == "history":
        tester.test_payment_history_queries()
    elif args.test == "new_agent":
        tester.test_new_agent_default_score()
    elif args.test == "validation":
        tester.test_validation_errors()
    elif args.test == "algorithm":
        tester.test_credit_scoring_algorithm()


if __name__ == "__main__":
    main()
