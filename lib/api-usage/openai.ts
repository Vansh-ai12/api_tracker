import { ProviderAdapter, ProviderCredentials, ProviderSyncResult, ProviderUsage, ProviderBalance, VerificationResult, ModelUsage } from "./types";
import { reconcileUsage, sanitizeProviderResponse } from "./verification";

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
      // Check if this is an Admin API key (starts with sk-proj- or has admin flag)
      const isAdminKey = credentials.apiKey.startsWith("sk-proj-") || credentials.isAdminKey === true;

      if (!isAdminKey) {
        // Regular API keys cannot access organization usage
        return {
          success: false,
          usage: { syncedAt: new Date().toISOString() },
          error: "Organization usage requires an Admin API key. Regular API keys do not have permission to access organization usage data. Please use an Admin API key (starts with sk-proj-)."
        };
      }

      // Fetch usage from OpenAI Admin API
      const startTime = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000); // 30 days ago
      const endTime = Math.floor(Date.now() / 1000);
      
      const usageUrl = `https://api.openai.com/v1/organization/usage?start_time=${startTime}&end_time=${endTime}&bucket_width=1d`;
      const usageResponse = await this.makeOpenAIRequest(
        credentials,
        usageUrl,
        "GET"
      );

      if (!usageResponse.ok) {
        if (usageResponse.status === 401) {
          return {
            success: false,
            usage: { syncedAt: new Date().toISOString() },
            error: "Invalid Admin API key or insufficient permissions"
          };
        }
        if (usageResponse.status === 403) {
          return {
            success: false,
            usage: { syncedAt: new Date().toISOString() },
            error: "Admin API key does not have permission to read organization usage"
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
      
      // Extract detailed breakdown for verification
      const modelBreakdown = this.extractModelBreakdown(usageData);
      const inputTokens = this.extractInputTokens(usageData, modelBreakdown);
      const outputTokens = this.extractOutputTokens(usageData, modelBreakdown);
      const cachedTokens = this.extractCachedTokens(usageData, modelBreakdown);
      const accountIdentifier = this.extractAccountIdentifier(usageData);
      
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
        rawProviderResponse: sanitizeProviderResponse(usageData),
        accountIdentifier,
        inputTokens,
        outputTokens,
        cachedTokens,
        modelBreakdown,
        metadata: {
          rawUsage: usageData
        }
      };

      // Perform verification
      const verification = this.verifyUsage(usage);

      return { success: true, usage, verification };
    } catch (error: any) {
      return {
        success: false,
        usage: { syncedAt: new Date().toISOString() },
        error: error.message || "Failed to fetch OpenAI usage"
      };
    }
  }

  async fetchBalance(credentials: ProviderCredentials): Promise<ProviderBalance | null> {
    try {
      // OpenAI doesn't have a separate balance endpoint
      // Balance information is typically part of the usage response or billing dashboard
      // Return null to indicate unavailable
      return null;
    } catch {
      return null;
    }
  }

  verifyUsage(usage: ProviderUsage): VerificationResult {
    return reconcileUsage(usage);
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
    // Admin API response format: { data: [{ object: "bucket", results: [{ n_generated_tokens_total, n_context_tokens_total, ... }] }] }
    if (data.data && Array.isArray(data.data)) {
      let total = 0;
      for (const bucket of data.data) {
        if (bucket.results && Array.isArray(bucket.results)) {
          for (const result of bucket.results) {
            total += result.n_generated_tokens_total || 0;
            total += result.n_context_tokens_total || 0;
          }
        }
      }
      return total > 0 ? total : null;
    }
    return null;
  }

  private extractInputTokens(data: any, modelBreakdown: ModelUsage[] | null): number | null {
    if (modelBreakdown && modelBreakdown.length > 0) {
      return modelBreakdown.reduce((sum, model) => sum + (model.inputTokens || 0), 0);
    }
    if (data.data && Array.isArray(data.data)) {
      let total = 0;
      for (const bucket of data.data) {
        if (bucket.results && Array.isArray(bucket.results)) {
          for (const result of bucket.results) {
            total += result.n_context_tokens_total || 0;
          }
        }
      }
      return total > 0 ? total : null;
    }
    return null;
  }

  private extractOutputTokens(data: any, modelBreakdown: ModelUsage[] | null): number | null {
    if (modelBreakdown && modelBreakdown.length > 0) {
      return modelBreakdown.reduce((sum, model) => sum + (model.outputTokens || 0), 0);
    }
    if (data.data && Array.isArray(data.data)) {
      let total = 0;
      for (const bucket of data.data) {
        if (bucket.results && Array.isArray(bucket.results)) {
          for (const result of bucket.results) {
            total += result.n_generated_tokens_total || 0;
          }
        }
      }
      return total > 0 ? total : null;
    }
    return null;
  }

  private extractCachedTokens(data: any, modelBreakdown: ModelUsage[] | null): number | null {
    if (modelBreakdown && modelBreakdown.length > 0) {
      return modelBreakdown.reduce((sum, model) => sum + (model.cachedTokens || 0), 0);
    }
    if (data.data && Array.isArray(data.data)) {
      let total = 0;
      for (const bucket of data.data) {
        if (bucket.results && Array.isArray(bucket.results)) {
          for (const result of bucket.results) {
            total += result.n_cached_tokens_total || 0;
          }
        }
      }
      return total > 0 ? total : null;
    }
    return null;
  }

  private extractModelBreakdown(data: any): ModelUsage[] | null {
    if (data.data && Array.isArray(data.data)) {
      const modelMap = new Map<string, ModelUsage>();
      
      for (const bucket of data.data) {
        if (bucket.results && Array.isArray(bucket.results)) {
          for (const result of bucket.results) {
            const model = result.model || "unknown";
            const existing = modelMap.get(model) || {
              model,
              inputTokens: 0,
              outputTokens: 0,
              cachedTokens: 0,
              totalTokens: 0,
              cost: 0,
              requests: 0,
            };
            
            existing.inputTokens += result.n_context_tokens_total || 0;
            existing.outputTokens += result.n_generated_tokens_total || 0;
            existing.cachedTokens += result.n_cached_tokens_total || 0;
            existing.totalTokens += (result.n_context_tokens_total || 0) + (result.n_generated_tokens_total || 0);
            existing.cost += result.cost || 0;
            existing.requests += result.n_requests || 1;
            
            modelMap.set(model, existing);
          }
        }
      }
      
      return Array.from(modelMap.values());
    }
    return null;
  }

  private extractTotalRequests(data: any): number | null {
    if (data.data && Array.isArray(data.data)) {
      let total = 0;
      for (const bucket of data.data) {
        if (bucket.results && Array.isArray(bucket.results)) {
          for (const result of bucket.results) {
            total += result.n_requests || 1;
          }
        }
      }
      return total > 0 ? total : null;
    }
    return null;
  }

  private extractTotalCost(data: any): number | null {
    if (data.data && Array.isArray(data.data)) {
      let total = 0;
      for (const bucket of data.data) {
        if (bucket.results && Array.isArray(bucket.results)) {
          for (const result of bucket.results) {
            total += result.cost || 0;
          }
        }
      }
      return total > 0 ? total : null;
    }
    return null;
  }

  private extractResetDate(data: any): string | null {
    // Admin API doesn't provide reset dates, usage is continuous
    return null;
  }

  private extractAccountIdentifier(data: any): string | null {
    // Admin API doesn't return organization ID in usage response
    return null;
  }
}
