/**
 * Normalized provider usage interface
 * All provider adapters must return data in this format
 */
export interface ProviderUsage {
  usageCurrent?: number | null;
  usageLimit?: number | null;
  usageUnit?: string | null;

  requests?: number | null;

  creditsRemaining?: number | null;
  creditLimit?: number | null;

  cost?: number | null;
  currency?: string | null;

  resetAt?: string | null;

  metadata?: Record<string, unknown>;

  syncedAt: string;

  // Verification fields
  rawProviderResponse?: Record<string, unknown> | null;
  accountIdentifier?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
  modelBreakdown?: ModelUsage[] | null;
}

/**
 * Model-level usage breakdown
 */
export interface ModelUsage {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
  cost?: number;
  requests?: number;
}

/**
 * Provider balance information
 */
export interface ProviderBalance {
  balance?: number | null;
  currency?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Verification status
 */
export enum VerificationStatus {
  VERIFIED = "verified",
  MISMATCH = "mismatch",
  UNAVAILABLE = "unavailable",
  FAILED = "failed",
}

/**
 * Verification result
 */
export interface VerificationResult {
  status: VerificationStatus;
  providerTotal: number | null;
  calculatedTotal: number | null;
  difference: number | null;
  differencePercentage: number | null;
  checkedAt: string;
  reason: string | null;
  tolerance: number; // tolerance percentage used
}

/**
 * Provider-specific credential configuration
 */
export interface ProviderCredentials {
  apiKey: string;
  organizationId?: string;
  projectId?: string;
  isAdminKey?: boolean;
  [key: string]: string | boolean | undefined;
}

/**
 * Provider sync result
 */
export interface ProviderSyncResult {
  success: boolean;
  usage: ProviderUsage;
  verification?: VerificationResult | null;
  balance?: ProviderBalance | null;
  error?: string;
  rateLimited?: boolean;
  rateLimitResetAt?: string;
}

/**
 * Provider adapter interface
 */
export interface ProviderAdapter {
  provider: string;
  displayName: string;
  credentialFields: string[];
  
  /**
   * Validate that credentials are properly formatted
   */
  validateCredentials(credentials: ProviderCredentials): boolean;
  
  /**
   * Test connection with lightweight request
   */
  testConnection(credentials: ProviderCredentials): Promise<boolean>;
  
  /**
   * Fetch usage from provider API
   */
  fetchUsage(credentials: ProviderCredentials): Promise<ProviderSyncResult>;
  
  /**
   * Fetch balance from provider API (optional)
   */
  fetchBalance?(credentials: ProviderCredentials): Promise<ProviderBalance | null>;
  
  /**
   * Verify usage by comparing provider-reported vs calculated totals
   */
  verifyUsage?(usage: ProviderUsage): VerificationResult;
}

/**
 * Sync error types
 */
export enum SyncErrorType {
  INVALID_CREDENTIALS = "invalid_credentials",
  RATE_LIMITED = "rate_limited",
  NETWORK_ERROR = "network_error",
  PROVIDER_ERROR = "provider_error",
  UNKNOWN = "unknown",
}

export interface SyncError {
  type: SyncErrorType;
  message: string;
  details?: string;
  retryAfter?: number; // seconds
}
