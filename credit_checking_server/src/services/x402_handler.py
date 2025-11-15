"""
X402 payment verification handler.

Implements the x402 protocol for sellers - verifying payments before processing requests.
"""

from typing import Optional
from decimal import Decimal
from fastapi import Request, Response, HTTPException
from datetime import datetime
import structlog

from ..config import settings

logger = structlog.get_logger(__name__)


class X402PaymentRequiredError(HTTPException):
    """
    Custom exception for 402 Payment Required responses.
    """

    def __init__(
        self,
        amount: Decimal,
        endpoint: str,
        currency: str = "USD"
    ):
        """
        Initialize 402 error.

        Args:
            amount: Required payment amount
            endpoint: Endpoint that requires payment
            currency: Payment currency
        """
        self.amount = amount
        self.endpoint = endpoint
        self.currency = currency

        super().__init__(
            status_code=402,
            detail={
                "error": "payment_required",
                "message": f"Payment of ${amount} {currency} required to access this endpoint",
                "payment_details": {
                    "amount": str(amount),
                    "currency": currency,
                    "payment_address": settings.locus_wallet_address,
                    "endpoint": endpoint
                },
                "instructions": "Include valid x402 payment proof in request headers",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        )


class X402Handler:
    """
    Handler for x402 payment verification.

    Mock implementation for development. Replace with real Locus integration for production.
    """

    def __init__(self):
        """
        Initialize x402 handler.
        """
        self.enabled = settings.x402_enabled

    def verify_payment(
        self,
        request: Request,
        required_amount: Decimal
    ) -> bool:
        """
        Verify x402 payment from request headers.

        Args:
            request: FastAPI request object
            required_amount: Required payment amount

        Returns:
            True if payment is valid, False otherwise
        """
        if not self.enabled:
            logger.warning("x402_disabled", message="Payment verification disabled")
            return True

        # Extract x402 headers
        payment_proof = request.headers.get("X-402-Payment-Proof")
        payment_amount = request.headers.get("X-402-Amount")
        payment_signature = request.headers.get("X-402-Signature")

        # Check if payment headers are present
        if not all([payment_proof, payment_amount, payment_signature]):
            logger.info(
                "payment_headers_missing",
                has_proof=bool(payment_proof),
                has_amount=bool(payment_amount),
                has_signature=bool(payment_signature)
            )
            return False

        # Validate payment amount
        try:
            provided_amount = Decimal(payment_amount)
        except (ValueError, TypeError):
            logger.warning(
                "invalid_payment_amount",
                payment_amount=payment_amount
            )
            return False

        if provided_amount < required_amount:
            logger.warning(
                "insufficient_payment",
                required=str(required_amount),
                provided=str(provided_amount)
            )
            return False

        # Mock verification - in production, verify with Locus
        # For development: accept any payment proof that starts with "test_" or "proof_"
        if settings.is_development:
            is_valid = payment_proof.startswith(("test_", "proof_", "mock_"))
            logger.info(
                "mock_payment_verified",
                payment_proof=payment_proof[:20],
                valid=is_valid
            )
            return is_valid

        # Production: Verify with Locus API
        return self._verify_with_locus(payment_proof, payment_signature, provided_amount)

    def _verify_with_locus(
        self,
        payment_proof: str,
        signature: str,
        amount: Decimal
    ) -> bool:
        """
        Verify payment with Locus API.

        TODO: Implement actual Locus API verification.

        Args:
            payment_proof: Payment proof from x402 header
            signature: Payment signature from x402 header
            amount: Payment amount

        Returns:
            True if payment is valid
        """
        # TODO: Implement Locus API verification
        # Example implementation:
        # try:
        #     response = requests.post(
        #         f"{settings.locus_api_url}/verify-payment",
        #         headers={"Authorization": f"Bearer {settings.locus_api_key}"},
        #         json={
        #             "payment_proof": payment_proof,
        #             "signature": signature,
        #             "amount": str(amount),
        #             "recipient": settings.locus_wallet_address
        #         }
        #     )
        #     return response.status_code == 200 and response.json().get("valid", False)
        # except Exception as e:
        #     logger.error("locus_verification_failed", error=str(e))
        #     return False

        logger.warning(
            "locus_verification_not_implemented",
            message="Using mock verification in production"
        )
        return True

    def require_payment(
        self,
        request: Request,
        amount: Decimal,
        endpoint: str
    ) -> None:
        """
        Verify payment or raise 402 error.

        Args:
            request: FastAPI request object
            amount: Required payment amount
            endpoint: Endpoint path

        Raises:
            X402PaymentRequiredError if payment is invalid or missing
        """
        if not self.verify_payment(request, amount):
            logger.info(
                "payment_required",
                endpoint=endpoint,
                amount=str(amount)
            )
            raise X402PaymentRequiredError(
                amount=amount,
                endpoint=endpoint
            )

    def create_402_response(
        self,
        amount: Decimal,
        endpoint: str,
        currency: str = "USD"
    ) -> Response:
        """
        Create a 402 Payment Required response.

        Args:
            amount: Required payment amount
            endpoint: Endpoint that requires payment
            currency: Payment currency

        Returns:
            FastAPI Response with 402 status
        """
        response = Response(
            content={
                "error": "payment_required",
                "message": f"Payment of ${amount} {currency} required",
                "payment_details": {
                    "amount": str(amount),
                    "currency": currency,
                    "payment_address": settings.locus_wallet_address,
                    "endpoint": endpoint
                }
            },
            status_code=402
        )

        # Add x402 headers
        response.headers["X-402-Amount"] = str(amount)
        response.headers["X-402-Currency"] = currency
        response.headers["X-402-Address"] = settings.locus_wallet_address

        return response


# Global handler instance
x402_handler = X402Handler()


def get_x402_handler() -> X402Handler:
    """
    Get the global x402 handler instance.

    Can be used as a FastAPI dependency.
    """
    return x402_handler


__all__ = ["X402Handler", "X402PaymentRequiredError", "x402_handler", "get_x402_handler"]
