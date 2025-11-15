"""
Credit scoring service for calculating agent credit scores.

Implements the credit scoring algorithm v1.0 based on payment history.
"""

from typing import List, Optional
from datetime import datetime
import structlog

from ..config import settings
from ..models import PaymentEvent

logger = structlog.get_logger(__name__)


class CreditScoringService:
    """
    Service for calculating credit scores based on payment history.

    Algorithm v1.0:
    - Base score: 70
    - On-time payment: +0.5 points (max +30)
    - Late 1-7 days: -2 points
    - Late 8-30 days: -5 points
    - Late >30 days: -10 points
    - Defaulted: -15 points
    - Final score clamped to [0, 100]
    """

    @staticmethod
    def calculate_credit_score(payment_events: List[PaymentEvent]) -> int:
        """
        Calculate credit score based on payment history.

        Args:
            payment_events: List of payment events for the agent

        Returns:
            Credit score (0-100)
        """
        if not payment_events:
            logger.debug(
                "calculating_default_score",
                reason="no_payment_history"
            )
            return settings.default_credit_score

        score = float(settings.default_credit_score)
        on_time_count = 0

        for event in payment_events:
            if event.status == "on_time":
                on_time_count += 1
            elif event.status == "late":
                if event.days_overdue <= 7:
                    score -= settings.late_payment_penalty_1_7_days
                elif event.days_overdue <= 30:
                    score -= settings.late_payment_penalty_8_30_days
                else:
                    score -= settings.late_payment_penalty_over_30_days
            elif event.status == "defaulted":
                score -= settings.defaulted_payment_penalty

        # Apply on-time bonus (capped)
        on_time_bonus = min(
            on_time_count * settings.on_time_payment_bonus,
            settings.max_on_time_bonus
        )
        score += on_time_bonus

        # Clamp to valid range
        final_score = max(
            settings.min_credit_score,
            min(settings.max_credit_score, int(score))
        )

        logger.debug(
            "credit_score_calculated",
            payment_count=len(payment_events),
            on_time_count=on_time_count,
            raw_score=score,
            final_score=final_score
        )

        return final_score

    @staticmethod
    def calculate_days_overdue(due_date: datetime, payment_date: Optional[datetime]) -> int:
        """
        Calculate days overdue for a payment.

        Args:
            due_date: When payment was due
            payment_date: When payment was made (None if defaulted)

        Returns:
            Number of days overdue (0 if on time or not paid yet)
        """
        if not payment_date:
            # Defaulted - calculate days since due date to now
            return max(0, (datetime.utcnow() - due_date).days)

        if payment_date <= due_date:
            return 0  # On time

        return (payment_date - due_date).days

    @staticmethod
    def determine_payment_status(
        due_date: datetime,
        payment_date: Optional[datetime]
    ) -> str:
        """
        Determine payment status based on dates.

        Args:
            due_date: When payment was due
            payment_date: When payment was made (None if defaulted)

        Returns:
            Payment status: "on_time", "late", or "defaulted"
        """
        if not payment_date:
            return "defaulted"

        if payment_date <= due_date:
            return "on_time"

        return "late"


__all__ = ["CreditScoringService"]
