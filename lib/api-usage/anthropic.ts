import { ProviderAdapter, ProviderCredentials, ProviderSyncResult, ProviderUsage, ProviderBalance, VerificationResult, VerificationStatus } from "./types";
import { reconcileUsage, sanitizeProviderResponse } from "./verification";

/**
 * Anthropic provider adapter
 * Uses official Anthropic API for usage and credit data
 */
export class AnthropicAdapter implements ProviderAdapter {
  provider = "anthropic";
  displayName = "Anthropic";
  credentialFields = ["apiKey"];

  validateCredentials(credentials: ProviderCredentials): boolean {
    return !!credentials.apiKey && credentials.apiKey.startsWith("sk-ant-");
  }

  async testConnection(credentials: ProviderCredentials): Promise<boolean> {
    try {
      const response = await this.makeAnthropicRequest(
        credentials,
        "https://api.anthropic.com/v1/messages",
        "POST",
        {
          model: "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "test" }]
        }
      );
      return response.ok || response.status === 400; // 400 might be due to message format
    } catch {
      return false;
    }
  }

  async fetchUsage(credentials: ProviderCredentials): Promise<ProviderSyncResult> {
    try {
      // Anthropic doesn't have a public usage API endpoint
      // We'll return null values and indicate this limitation
      const usage: ProviderUsage = {
        usageCurrent: null,
        usageLimit: null,
        usageUnit: null,
        requests: null,
        creditsRemaining: null,
        creditLimit: null,
        cost: null,
        currency: null,
        resetAt: null,
        syncedAt: new Date().toISOString(),
        rawProviderResponse: null,
        accountIdentifier: null,
        inputTokens: null,
        outputTokens: null,
        cachedTokens: null,
        modelBreakdown: null,
        metadata: {
          limitation: "Anthropic does not provide a public usage API. Manual tracking required."
        }
      };

      // Verification is unavailable since we can't fetch usage data
      const verification: VerificationResult = {
        status: VerificationStatus.UNAVAILABLE,
        providerTotal: null,
        calculatedTotal: null,
        difference: null,
        differencePercentage: null,
        checkedAt: new Date().toISOString(),
        reason: "Anthropic does not expose sufficient usage data for verification",
        tolerance: 1.0,
      };

      return { 
        success: true, 
        usage,
        verification,
        error: "Automatic usage tracking not available for Anthropic. Please update usage manually."
      };
    } catch (error: any) {
      return {
        success: false,
        usage: { syncedAt: new Date().toISOString() },
        error: error.message || "Failed to fetch Anthropic usage"
      };
    }
  }

  async fetchBalance(credentials: ProviderCredentials): Promise<ProviderBalance | null> {
    try {
      // Anthropic doesn't have a public balance endpoint
      return null;
    } catch {
      return null;
    }
  }

  verifyUsage(usage: ProviderUsage): VerificationResult {
    return reconcileUsage(usage);
  }

  private async makeAnthropicRequest(
    credentials: ProviderCredentials,
    url: string,
    method: string,
    body?: any
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "x-api-key": credentials.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    };

    return fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  }
}
