import { ProviderAdapter, ProviderCredentials, ProviderSyncResult, ProviderUsage, ProviderBalance, VerificationResult, VerificationStatus } from "./types";
import { reconcileUsage, sanitizeProviderResponse } from "./verification";

/**
 * Google Gemini provider adapter
 * Uses Google Cloud APIs for usage and quota data
 */
export class GeminiAdapter implements ProviderAdapter {
  provider = "gemini";
  displayName = "Google Gemini";
  credentialFields = ["apiKey", "projectId"];

  validateCredentials(credentials: ProviderCredentials): boolean {
    return !!credentials.apiKey && credentials.apiKey.length > 0;
  }

  async testConnection(credentials: ProviderCredentials): Promise<boolean> {
    try {
      // Test with a simple models list request
      const response = await this.makeGeminiRequest(
        credentials,
        "https://generativelanguage.googleapis.com/v1/models",
        "GET"
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async fetchUsage(credentials: ProviderCredentials): Promise<ProviderSyncResult> {
    try {
      // Google Cloud usage requires project-level credentials and specific APIs
      // API keys alone don't provide usage/cost data
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
        accountIdentifier: credentials.projectId || null,
        inputTokens: null,
        outputTokens: null,
        cachedTokens: null,
        modelBreakdown: null,
        metadata: {
          limitation: "Gemini API keys do not provide usage/cost data. Google Cloud project credentials required for automatic tracking."
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
        reason: "Gemini API keys do not expose sufficient usage data for verification",
        tolerance: 1.0,
      };

      return { 
        success: true, 
        usage,
        verification,
        error: "Automatic usage tracking not available for Gemini API keys. Please update usage manually or use Google Cloud project credentials."
      };
    } catch (error: any) {
      return {
        success: false,
        usage: { syncedAt: new Date().toISOString() },
        error: error.message || "Failed to fetch Gemini usage"
      };
    }
  }

  async fetchBalance(credentials: ProviderCredentials): Promise<ProviderBalance | null> {
    try {
      // Gemini API keys don't provide balance information
      return null;
    } catch {
      return null;
    }
  }

  verifyUsage(usage: ProviderUsage): VerificationResult {
    return reconcileUsage(usage);
  }

  private async makeGeminiRequest(
    credentials: ProviderCredentials,
    url: string,
    method: string
  ): Promise<Response> {
    const params = new URLSearchParams({
      key: credentials.apiKey
    });

    return fetch(`${url}?${params.toString()}`, {
      method
    });
  }
}
