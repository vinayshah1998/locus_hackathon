/**
 * Agent Personality Configuration
 * Defines how the agent behaves during payment negotiations
 */

export interface PersonalityConfig {
  name: string;
  description: string;

  // Risk tolerance for accepting delayed payments
  riskTolerance: 'low' | 'medium' | 'high';

  // Minimum credit score to accept delayed payment
  minCreditScoreForDelay: number;

  // Maximum days of delay to accept
  maxAcceptableDelayDays: number;

  // Whether to always require user approval for decisions
  alwaysRequireUserApproval: boolean;

  // Threshold above which auto-approve (if not alwaysRequireUserApproval)
  autoApproveScoreThreshold: number;

  // How aggressive to be in requesting delays
  paymentStrategy: 'immediate' | 'balanced' | 'delay_seeking';

  // Default delay to request when seeking delays (days)
  preferredDelayDays: number;
}

// Preset personalities
export const PERSONALITIES: Record<string, PersonalityConfig> = {
  conservative: {
    name: 'Conservative',
    description: 'Pay debts immediately, demand immediate payment from others. Very risk-averse.',
    riskTolerance: 'low',
    minCreditScoreForDelay: 90,
    maxAcceptableDelayDays: 7,
    alwaysRequireUserApproval: true,
    autoApproveScoreThreshold: 95,
    paymentStrategy: 'immediate',
    preferredDelayDays: 0
  },

  balanced: {
    name: 'Balanced',
    description: 'Reasonable negotiation based on creditworthiness. Moderate risk tolerance.',
    riskTolerance: 'medium',
    minCreditScoreForDelay: 70,
    maxAcceptableDelayDays: 30,
    alwaysRequireUserApproval: false,
    autoApproveScoreThreshold: 80,
    paymentStrategy: 'balanced',
    preferredDelayDays: 14
  },

  aggressive: {
    name: 'Aggressive',
    description: 'Delay payments when possible, demand early payment. Money is tight.',
    riskTolerance: 'high',
    minCreditScoreForDelay: 50,
    maxAcceptableDelayDays: 60,
    alwaysRequireUserApproval: false,
    autoApproveScoreThreshold: 60,
    paymentStrategy: 'delay_seeking',
    preferredDelayDays: 30
  }
};

export function getPersonality(name: string): PersonalityConfig {
  const personality = PERSONALITIES[name.toLowerCase()];
  if (!personality) {
    console.warn(`Unknown personality "${name}", defaulting to balanced`);
    return PERSONALITIES.balanced;
  }
  return personality;
}

export function evaluatePaymentDecision(
  personality: PersonalityConfig,
  creditScore: number,
  requestedDelayDays: number,
  amount: number
): {
  recommendation: 'accept' | 'reject' | 'counter_offer';
  reason: string;
  requiresUserApproval: boolean;
  counterOffer?: { delayDays: number };
} {
  // Check if credit score meets minimum
  if (creditScore < personality.minCreditScoreForDelay) {
    return {
      recommendation: 'reject',
      reason: `Credit score ${creditScore} is below minimum threshold of ${personality.minCreditScoreForDelay}`,
      requiresUserApproval: personality.alwaysRequireUserApproval
    };
  }

  // Check if delay is acceptable
  if (requestedDelayDays > personality.maxAcceptableDelayDays) {
    // Offer counter with max acceptable delay
    return {
      recommendation: 'counter_offer',
      reason: `Requested delay of ${requestedDelayDays} days exceeds maximum of ${personality.maxAcceptableDelayDays} days`,
      requiresUserApproval: personality.alwaysRequireUserApproval,
      counterOffer: {
        delayDays: personality.maxAcceptableDelayDays
      }
    };
  }

  // Credit score is acceptable and delay is within limits
  const requiresApproval = personality.alwaysRequireUserApproval ||
    creditScore < personality.autoApproveScoreThreshold;

  return {
    recommendation: 'accept',
    reason: `Credit score ${creditScore} meets threshold and delay of ${requestedDelayDays} days is acceptable`,
    requiresUserApproval: requiresApproval
  };
}

export function generatePaymentRequestStrategy(
  personality: PersonalityConfig,
  amount: number,
  urgency: 'low' | 'medium' | 'high' = 'medium'
): {
  shouldRequestDelay: boolean;
  delayDays: number;
  reason: string;
} {
  switch (personality.paymentStrategy) {
    case 'immediate':
      return {
        shouldRequestDelay: false,
        delayDays: 0,
        reason: 'Paying immediately as per conservative policy'
      };

    case 'delay_seeking':
      return {
        shouldRequestDelay: true,
        delayDays: personality.preferredDelayDays,
        reason: 'Requesting maximum delay to preserve cash flow'
      };

    case 'balanced':
    default:
      const shouldDelay = urgency === 'low' || amount > 1000;
      return {
        shouldRequestDelay: shouldDelay,
        delayDays: shouldDelay ? Math.min(personality.preferredDelayDays, 14) : 0,
        reason: shouldDelay
          ? 'Requesting moderate delay for cash flow management'
          : 'Paying promptly for smaller/urgent amounts'
      };
  }
}
