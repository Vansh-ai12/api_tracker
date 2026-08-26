/**
 * Base interface for API provider connectors
 * Each provider (OpenAI, Anthropic, etc.) implements this interface
 */

export interface ProviderUsageData {
  usage_current: number | null;
  usage_limit: number | null;
  credits_remaining: number | null;
  credit_limit: number | null;
  reset_at: string | null;
  cost: number | null;
}

export interface ProviderConnector {
  /**
   * Provider identifier (e.g., "openai", "anthropic")
   */
  provider: string;

  /**
   * Retrieve current usage from the provider API
   * Returns null if the value is not available from the provider
   */
  fetchUsage(encryptedCredentials: string): Promise<ProviderUsageData>;

  /**
   * Validate that credentials are properly formatted for this provider
   */
  validateCredentials(credentials: string): boolean;
}

/**
 * Base class for provider connectors with common utilities
 */
export abstract class BaseProviderConnector implements ProviderConnector {
  abstract provider: string;
  abstract fetchUsage(encryptedCredentials: string): Promise<ProviderUsageData>;
  abstract validateCredentials(credentials: string): boolean;

  /**
   * Helper to handle API errors gracefully
   */
  protected handleApiError(error: any, context: string): ProviderUsageData {
    console.error(`[${this.provider}] ${context}:`, error);
    return {
      usage_current: null,
      usage_limit: null,
      credits_remaining: null,
      credit_limit: null,
      reset_at: null,
      cost: null,
    };
  }
}
