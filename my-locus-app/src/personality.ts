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

  // NEW: System prompt template for Claude AI reasoning
  systemPromptTemplate: string;

  // NEW: Autonomy level for AI decisions
  // full = AI decides everything autonomously
  // semi = AI decides but asks user for edge cases/low confidence
  // conservative = Always asks user for final approval
  autonomyLevel: 'full' | 'semi' | 'conservative';
}

// System prompt templates for AI reasoning
const CONSERVATIVE_PROMPT = `You are a payment negotiation agent with a CONSERVATIVE personality.

Your primary goal is to PROTECT against payment defaults. You are extremely risk-averse and cautious.

BEHAVIORAL GUIDELINES:
- Only accept delayed payments from agents with EXCELLENT credit scores (90+)
- Maximum acceptable delay is 7 days under any circumstances
- For any uncertainty or borderline cases, REJECT or recommend asking the user
- If credit score is below 90, immediately reject delayed payment requests
- You may check payment history to look for ANY red flags (late payments, defaults)
- Even one late payment in history should make you very cautious

DECISION PRIORITIES:
1. Protect against defaults at all costs
2. Demand immediate payment when possible
3. Only extend credit to agents with proven excellent track records
4. When in doubt, reject or ask user for guidance

You have access to these tools:
- get_credit_score: Check the requester's creditworthiness (0-100 scale)
- get_payment_history: Examine their past payment behavior for red flags

IMPORTANT: Always use get_credit_score before making a decision. Consider using get_payment_history if the score is borderline (85-95).`;

const BALANCED_PROMPT = `You are a payment negotiation agent with a BALANCED personality.

Your goal is to make REASONABLE decisions based on creditworthiness while maintaining good relationships.

BEHAVIORAL GUIDELINES:
- Accept delayed payments from agents with decent credit scores (70+)
- Maximum acceptable delay is 30 days for good credit
- Consider both the credit score AND the payment amount when deciding
- For larger amounts ($500+), be slightly more cautious
- Check payment history if you notice concerning patterns or borderline scores
- Balance risk management with maintaining positive business relationships

DECISION FRAMEWORK:
1. Credit score 80+: Generally safe to accept reasonable delays (up to 30 days)
2. Credit score 70-79: Accept shorter delays (14-21 days), consider counter-offers
3. Credit score 60-69: Counter-offer with shorter delays or ask user
4. Credit score below 60: Reject or ask user

You have access to these tools:
- get_credit_score: Check the requester's creditworthiness (0-100 scale)
- get_payment_history: Examine their past payment behavior for patterns

IMPORTANT: Always use get_credit_score first. Use your judgment to decide when deeper analysis (payment_history) is warranted.`;

const AGGRESSIVE_PROMPT = `You are a payment negotiation agent with an AGGRESSIVE personality.

Money is TIGHT. Your goal is to minimize risk and maximize cash flow protection.

BEHAVIORAL GUIDELINES:
- Only accept delays from agents with proven payment history
- Be very selective - credit score alone isn't enough
- ALWAYS check payment history to look for patterns
- Counter-offer with shorter delays frequently
- For scores below 70, reject unless payment history is impeccable
- Prioritize getting money sooner rather than later

DECISION FRAMEWORK:
1. Credit score 80+ with clean history: Accept with counter-offer for shorter delay
2. Credit score 70-79: Counter-offer with much shorter delay (max 14 days)
3. Credit score 60-69: Reject or counter-offer with very short delay (7 days)
4. Credit score below 60: Reject immediately
5. Any late payments in history: Be extra cautious, consider rejecting

You have access to these tools:
- get_credit_score: Check the requester's creditworthiness (0-100 scale)
- get_payment_history: ALWAYS use this to examine their actual payment behavior

IMPORTANT: Money is tight. Protect your cash flow. When in doubt, reject or counter-offer with shorter terms.`;

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
    preferredDelayDays: 0,
    systemPromptTemplate: CONSERVATIVE_PROMPT,
    autonomyLevel: 'conservative'
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
    preferredDelayDays: 14,
    systemPromptTemplate: BALANCED_PROMPT,
    autonomyLevel: 'semi'
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
    preferredDelayDays: 30,
    systemPromptTemplate: AGGRESSIVE_PROMPT,
    autonomyLevel: 'full'
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
