import { ProviderUsage, VerificationResult, VerificationStatus } from "./types";

const DEFAULT_TOLERANCE_PERCENTAGE = 1.0; // 1% tolerance for floating-point differences

/**
 * Reconcile provider-reported usage with independently calculated totals
 */
export function reconcileUsage(
  usage: ProviderUsage,
  tolerancePercentage: number = DEFAULT_TOLERANCE_PERCENTAGE
): VerificationResult {
  const checkedAt = new Date().toISOString();

  // If we don't have enough data to verify, mark as unavailable
  if (
    usage.usageCurrent === null &&
    usage.inputTokens === null &&
    usage.outputTokens === null &&
    usage.modelBreakdown === null
  ) {
    return {
      status: VerificationStatus.UNAVAILABLE,
      providerTotal: null,
      calculatedTotal: null,
      difference: null,
      differencePercentage: null,
      checkedAt,
      reason: "Provider does not expose sufficient usage data for verification",
      tolerance: tolerancePercentage,
    };
  }

  // Calculate total from breakdown if available
  let calculatedTotal: number | null = null;
  
  if (usage.modelBreakdown && usage.modelBreakdown.length > 0) {
    // Sum total tokens from model breakdown
    calculatedTotal = usage.modelBreakdown.reduce(
      (sum, model) => sum + (model.totalTokens ?? 0),
      0
    );
  } else if (usage.inputTokens !== null || usage.outputTokens !== null) {
    // Calculate from input + output tokens
    calculatedTotal = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  }

  // Provider-reported total
  const providerTotal: number | null = usage.usageCurrent ?? null;

  // If we can't calculate a total, verification is unavailable
  if (calculatedTotal === null) {
    return {
      status: VerificationStatus.UNAVAILABLE,
      providerTotal,
      calculatedTotal: null,
      difference: null,
      differencePercentage: null,
      checkedAt,
      reason: "Cannot calculate independent total from available data",
      tolerance: tolerancePercentage,
    };
  }

  // If provider doesn't report a total, we can only show calculated
  if (providerTotal === null) {
    return {
      status: VerificationStatus.UNAVAILABLE,
      providerTotal: null,
      calculatedTotal,
      difference: null,
      differencePercentage: null,
      checkedAt,
      reason: "Provider does not report total usage, only calculated total available",
      tolerance: tolerancePercentage,
    };
  }

  // Calculate difference
  const difference = Math.abs(providerTotal - calculatedTotal);
  const differencePercentage = providerTotal > 0 
    ? (difference / providerTotal) * 100 
    : 0;

  // Determine verification status
  let status: VerificationStatus;
  let reason: string | null = null;

  if (differencePercentage <= tolerancePercentage) {
    status = VerificationStatus.VERIFIED;
  } else {
    status = VerificationStatus.MISMATCH;
    reason = `Provider reported ${providerTotal}, calculated ${calculatedTotal} (difference: ${differencePercentage.toFixed(2)}%)`;
  }

  return {
    status,
    providerTotal,
    calculatedTotal,
    difference,
    differencePercentage,
    checkedAt,
    reason,
    tolerance: tolerancePercentage,
  };
}

/**
 * Reconcile cost if both provider-reported and calculated cost are available
 */
export function reconcileCost(
  usage: ProviderUsage,
  tolerancePercentage: number = DEFAULT_TOLERANCE_PERCENTAGE
): VerificationResult | null {
  if (usage.cost === null || usage.cost === undefined) {
    return null;
  }

  let calculatedCost: number | null = null;

  if (usage.modelBreakdown && usage.modelBreakdown.length > 0) {
    calculatedCost = usage.modelBreakdown.reduce(
      (sum, model) => sum + (model.cost ?? 0),
      0
    );
  }

  if (calculatedCost === null) {
    return null;
  }

  const difference = Math.abs(usage.cost - calculatedCost);
  const differencePercentage = usage.cost > 0 
    ? (difference / usage.cost) * 100 
    : 0;

  const checkedAt = new Date().toISOString();

  let status: VerificationStatus;
  let reason: string | null = null;

  if (differencePercentage <= tolerancePercentage) {
    status = VerificationStatus.VERIFIED;
  } else {
    status = VerificationStatus.MISMATCH;
    reason = `Provider reported $${usage.cost}, calculated $${calculatedCost} (difference: ${differencePercentage.toFixed(2)}%)`;
  }

  return {
    status,
    providerTotal: usage.cost,
    calculatedTotal: calculatedCost,
    difference,
    differencePercentage,
    checkedAt,
    reason,
    tolerance: tolerancePercentage,
  };
}

/**
 * Sanitize raw provider response to remove sensitive data before storage
 */
export function sanitizeProviderResponse(response: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(response)) {
    // Remove sensitive fields
    if (
      key.toLowerCase().includes("key") ||
      key.toLowerCase().includes("secret") ||
      key.toLowerCase().includes("token") ||
      key.toLowerCase().includes("password") ||
      key.toLowerCase().includes("authorization") ||
      key.toLowerCase().includes("credential")
    ) {
      continue;
    }

    // Recursively sanitize nested objects
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeProviderResponse(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === "object" && item !== null && !Array.isArray(item)
          ? sanitizeProviderResponse(item as Record<string, unknown>)
          : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
