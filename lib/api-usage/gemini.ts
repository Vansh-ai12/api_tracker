import { ProviderAdapter, ProviderCredentials, ProviderSyncResult, ProviderUsage } from "./types";

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
        metadata: {
          limitation: "Gemini API keys do not provide usage/cost data. Google Cloud project credentials required for automatic tracking."
        }
      };

      return { 
        success: true, 
        usage,
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
