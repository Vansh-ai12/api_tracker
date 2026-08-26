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
}

/**
 * Provider-specific credential configuration
 */
export interface ProviderCredentials {
  apiKey: string;
  organizationId?: string;
  projectId?: string;
  [key: string]: string | undefined;
}

/**
 * Provider sync result
 */
export interface ProviderSyncResult {
  success: boolean;
  usage: ProviderUsage;
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
