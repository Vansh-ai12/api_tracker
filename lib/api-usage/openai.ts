import { ProviderAdapter, ProviderCredentials, ProviderSyncResult, ProviderUsage } from "./types";

/**
 * OpenAI provider adapter
 * Uses official OpenAI API for usage and cost data
 */
export class OpenAIAdapter implements ProviderAdapter {
  provider = "openai";
  displayName = "OpenAI";
  credentialFields = ["apiKey", "organizationId"];

  validateCredentials(credentials: ProviderCredentials): boolean {
    return !!credentials.apiKey && credentials.apiKey.startsWith("sk-");
  }

  async testConnection(credentials: ProviderCredentials): Promise<boolean> {
    try {
      const response = await this.makeOpenAIRequest(
        credentials,
        "https://api.openai.com/v1/models",
        "GET"
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async fetchUsage(credentials: ProviderCredentials): Promise<ProviderSyncResult> {
    try {
      // Fetch usage from OpenAI API
      const usageResponse = await this.makeOpenAIRequest(
        credentials,
        "https://api.openai.com/v1/usage",
        "GET"
      );

      if (!usageResponse.ok) {
        if (usageResponse.status === 401) {
          return {
            success: false,
            usage: { syncedAt: new Date().toISOString() },
            error: "Invalid API key"
          };
        }
        if (usageResponse.status === 429) {
          return {
            success: false,
            usage: { syncedAt: new Date().toISOString() },
            error: "Rate limited",
            rateLimited: true
          };
        }
        return {
          success: false,
          usage: { syncedAt: new Date().toISOString() },
          error: `OpenAI API error: ${usageResponse.status}`
        };
      }

      const usageData = await usageResponse.json();
      
      // Normalize usage data
      const usage: ProviderUsage = {
        usageCurrent: this.extractTotalTokens(usageData),
        usageLimit: null, // OpenAI doesn't provide a hard limit via API
        usageUnit: "tokens",
        requests: this.extractTotalRequests(usageData),
        cost: this.extractTotalCost(usageData),
        currency: "USD",
        resetAt: this.extractResetDate(usageData),
        syncedAt: new Date().toISOString(),
        metadata: {
          rawUsage: usageData
        }
      };

      return { success: true, usage };
    } catch (error: any) {
      return {
        success: false,
        usage: { syncedAt: new Date().toISOString() },
        error: error.message || "Failed to fetch OpenAI usage"
      };
    }
  }

  private async makeOpenAIRequest(
    credentials: ProviderCredentials,
    url: string,
    method: string
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${credentials.apiKey}`,
      "Content-Type": "application/json"
    };

    if (credentials.organizationId) {
      headers["OpenAI-Organization"] = credentials.organizationId;
    }

    return fetch(url, {
      method,
      headers
    });
  }

  private extractTotalTokens(data: any): number | null {
    // OpenAI usage API returns data in various formats
    // This is a simplified extraction - actual format depends on the specific endpoint
    if (data.total_usage) return data.total_usage;
    if (data.data && Array.isArray(data.data)) {
      return data.data.reduce((sum: number, item: any) => sum + (item.total_tokens || 0), 0);
    }
    return null;
  }

  private extractTotalRequests(data: any): number | null {
    if (data.total_requests) return data.total_requests;
    if (data.data && Array.isArray(data.data)) {
      return data.data.length;
    }
    return null;
  }

  private extractTotalCost(data: any): number | null {
    if (data.total_cost) return data.total_cost;
    // OpenAI doesn't always provide cost via API
    return null;
  }

  private extractResetDate(data: any): string | null {
    if (data.reset_date) return data.reset_date;
    if (data.current_usage && data.current_usage.reset_date) {
      return data.current_usage.reset_date;
    }
    return null;
  }
}
