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
      // A normal project/inference key must never be treated as organization
      // authority. The user explicitly selects the Admin credential mode.
      const isAdminKey = credentials.isAdminKey === true;

      if (!isAdminKey) {
        // Regular API keys cannot access organization usage
        return {
          success: false,
          usage: { syncedAt: new Date().toISOString() },
          error: "Organization usage and costs require an OpenAI Organization Admin API key. A standard inference key can connect, but cannot read organization usage."
        };
      }

      // The documented Admin endpoint uses /usage/completions. Grouping preserves
      // the available model, project and API-key dimensions for snapshots.
      const startTime = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000); // 30 days ago
      const endTime = Math.floor(Date.now() / 1000);
      
      const query = new URLSearchParams({ start_time: String(startTime), end_time: String(endTime), bucket_width: "1d", limit: "31" });
      query.append("group_by", "model");
      query.append("group_by", "project_id");
      query.append("group_by", "api_key_id");
      const usageData = await this.fetchAllPages(credentials, `/v1/organization/usage/completions?${query}`);

      // Costs are authoritative billing data; do not reconstruct them from
      // model prices. Permission failures leave cost explicitly unavailable.
      const costQuery = new URLSearchParams({ start_time: String(startTime), end_time: String(endTime), bucket_width: "1d", limit: "31" });
      costQuery.append("group_by", "project_id");
      const costsData = await this.fetchAllPages(credentials, `/v1/organization/costs?${costQuery}`).catch(() => null);
      
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
        cost: costsData ? this.extractTotalCost(costsData) : null,
        currency: costsData ? this.extractCostCurrency(costsData) : null,
        resetAt: this.extractResetDate(usageData),
        syncedAt: new Date().toISOString(),
        rawProviderResponse: sanitizeProviderResponse({ usage: usageData, costs: costsData }),
        accountIdentifier,
        inputTokens,
        outputTokens,
        cachedTokens,
        modelBreakdown,
        metadata: {
          source: "OpenAI Usage API",
          costSource: costsData ? "OpenAI Costs API" : "unavailable",
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

  private async fetchAllPages(credentials: ProviderCredentials, path: string): Promise<any> {
    const all: any[] = [];
    let nextPage: string | null = null;
    do {
      const url = new URL(`https://api.openai.com${path}`);
      if (nextPage) url.searchParams.set("page", nextPage);
      const response = await this.makeOpenAIRequest(credentials, `${url.pathname}${url.search}`, "GET");
      if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
      const page = await response.json();
      all.push(...(Array.isArray(page.data) ? page.data : []));
      nextPage = page.has_more ? page.next_page || null : null;
    } while (nextPage);
    return { data: all };
  }

  private extractTotalTokens(data: any): number | null {
    // Admin API response format: { data: [{ object: "bucket", results: [{ n_generated_tokens_total, n_context_tokens_total, ... }] }] }
    if (data.data && Array.isArray(data.data)) {
      let total = 0;
      for (const bucket of data.data) {
        if (bucket.results && Array.isArray(bucket.results)) {
          for (const result of bucket.results) {
            total += result.output_tokens || result.n_generated_tokens_total || 0;
            total += result.input_tokens || result.n_context_tokens_total || 0;
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
            total += result.input_tokens || result.n_context_tokens_total || 0;
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
            total += result.output_tokens || result.n_generated_tokens_total || 0;
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
            total += result.input_cached_tokens || result.n_cached_tokens_total || 0;
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
            
            existing.inputTokens += result.input_tokens || result.n_context_tokens_total || 0;
            existing.outputTokens += result.output_tokens || result.n_generated_tokens_total || 0;
            existing.cachedTokens += result.input_cached_tokens || result.n_cached_tokens_total || 0;
            existing.totalTokens += (result.input_tokens || result.n_context_tokens_total || 0) + (result.output_tokens || result.n_generated_tokens_total || 0);
            existing.requests += result.num_model_requests || result.n_requests || 0;
            
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
            total += result.num_model_requests || result.n_requests || 0;
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
            total += result.amount?.value || result.cost || 0;
          }
        }
      }
      return total > 0 ? total : null;
    }
    return null;
  }

  private extractCostCurrency(data: any): string | null {
    for (const bucket of data.data || []) for (const result of bucket.results || []) {
      if (typeof result.amount?.currency === "string") return result.amount.currency.toUpperCase();
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
