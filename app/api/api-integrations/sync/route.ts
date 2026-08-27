import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase-server";
import { decryptToken } from "@/lib/encryption";
import { providerRegistry } from "@/lib/api-usage/registry";
import { ProviderCredentials } from "@/lib/api-usage/types";
import { logAuditEvent } from "@/lib/audit-logger";
import { requireProUser } from "@/lib/plan";

const SYNC_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forbidden = await requireProUser(userId);
  if (forbidden) return forbidden;

  const supabase = createServiceClient();

  try {
    const body = await request.json();
    const { integration_id } = body;

    if (!integration_id) {
      return NextResponse.json({ error: "Integration ID required" }, { status: 400 });
    }

    // Verify ownership
    const { data: integration } = await supabase
      .from("api_integrations")
      .select("*")
      .eq("id", integration_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    }

    // Only sync connected integrations
    if (integration.connection_type !== "automatic") {
      return NextResponse.json({ 
        error: "Only automatic integrations can be synced",
        message: "This integration is set to manual tracking. Update usage manually."
      }, { status: 400 });
    }

    // Check sync lock
    const now = new Date();
    if (integration.sync_lock_until && new Date(integration.sync_lock_until) > now) {
      return NextResponse.json({ 
        error: "Sync already in progress",
        message: "A sync is already running for this integration."
      }, { status: 409 });
    }

    // Acquire sync lock
    const lockUntil = new Date(Date.now() + SYNC_LOCK_TIMEOUT_MS);
    await supabase
      .from("api_integrations")
      .update({
        last_sync_status: "syncing",
        last_sync_started_at: now.toISOString(),
        sync_lock_until: lockUntil.toISOString(),
        last_sync_error: null,
      })
      .eq("id", integration_id);

    logAuditEvent("api_integration_sync_started", { userId });

    try {
      // Get provider adapter
      const adapter = providerRegistry.get(integration.provider);
      if (!adapter) {
        throw new Error(`No adapter found for provider: ${integration.provider}`);
      }

      // Decrypt credentials
      if (!integration.encrypted_credentials) {
        throw new Error("No credentials found for this integration");
      }

      const decryptedCredentials = decryptToken(integration.encrypted_credentials);
      const credentials: ProviderCredentials = {
        apiKey: decryptedCredentials,
      };

      // Parse metadata for additional credential fields
      if (integration.metadata && typeof integration.metadata === "object") {
        const meta = integration.metadata as Record<string, unknown>;
        if (meta.organizationId) credentials.organizationId = meta.organizationId as string;
        if (meta.projectId) credentials.projectId = meta.projectId as string;
      }

      // Fetch usage from provider
      const syncResult = await adapter.fetchUsage(credentials);

      // Update integration with sync results
      const updateData: any = {
        last_synced_at: now.toISOString(),
        last_sync_status: syncResult.success ? "completed" : "failed",
        sync_lock_until: null,
      };

      if (syncResult.success) {
        if (syncResult.usage.usageCurrent !== undefined) updateData.usage_current = syncResult.usage.usageCurrent;
        if (syncResult.usage.usageLimit !== undefined) updateData.usage_limit = syncResult.usage.usageLimit;
        if (syncResult.usage.usageUnit) updateData.usage_unit = syncResult.usage.usageUnit;
        if (syncResult.usage.requests !== undefined) updateData.usage_current = syncResult.usage.requests; // Store requests in usage_current for now
        if (syncResult.usage.creditsRemaining !== undefined) updateData.credits_remaining = syncResult.usage.creditsRemaining;
        if (syncResult.usage.creditLimit !== undefined) updateData.credit_limit = syncResult.usage.creditLimit;
        if (syncResult.usage.cost !== undefined) updateData.cost = syncResult.usage.cost;
        if (syncResult.usage.currency) updateData.currency = syncResult.usage.currency;
        if (syncResult.usage.resetAt) updateData.reset_at = syncResult.usage.resetAt;
        if (syncResult.usage.metadata) updateData.metadata = syncResult.usage.metadata;
        
        // Store verification results
        if (syncResult.verification) {
          updateData.verification_status = syncResult.verification.status;
          updateData.verification_provider_total = syncResult.verification.providerTotal;
          updateData.verification_calculated_total = syncResult.verification.calculatedTotal;
          updateData.verification_difference = syncResult.verification.difference;
          updateData.verification_difference_percentage = syncResult.verification.differencePercentage;
          updateData.verification_checked_at = syncResult.verification.checkedAt;
          updateData.verification_reason = syncResult.verification.reason;
          updateData.verification_tolerance = syncResult.verification.tolerance;
        }

        // Store account identifier
        if (syncResult.usage.accountIdentifier) {
          updateData.account_identifier = syncResult.usage.accountIdentifier;
        }
        
        // Calculate next sync time
        const interval = integration.sync_interval_minutes || 360; // Default 6 hours
        updateData.next_sync_at = new Date(Date.now() + interval * 60 * 1000).toISOString();
      } else {
        updateData.last_sync_error = syncResult.error || "Sync failed";
      }

      await supabase
        .from("api_integrations")
        .update(updateData)
        .eq("id", integration_id);

      // Record usage history on successful sync
      if (syncResult.success) {
        await supabase.from("api_usage_history").insert({
          integration_id: integration.id,
          user_id: userId,
          provider: integration.provider,
          usage_current: syncResult.usage.usageCurrent,
          usage_limit: syncResult.usage.usageLimit,
          usage_unit: syncResult.usage.usageUnit,
          requests: syncResult.usage.requests,
          credits_remaining: syncResult.usage.creditsRemaining,
          credit_limit: syncResult.usage.creditLimit,
          cost: syncResult.usage.cost,
          currency: syncResult.usage.currency,
          reset_at: syncResult.usage.resetAt,
          metadata: syncResult.usage.metadata,
          recorded_at: now.toISOString(),
        });

        // Record verification history
        if (syncResult.verification) {
          await supabase.from("api_verification_history").insert({
            integration_id: integration.id,
            user_id: userId,
            provider: integration.provider,
            verification_status: syncResult.verification.status,
            verification_provider_total: syncResult.verification.providerTotal,
            verification_calculated_total: syncResult.verification.calculatedTotal,
            verification_difference: syncResult.verification.difference,
            verification_difference_percentage: syncResult.verification.differencePercentage,
            verification_reason: syncResult.verification.reason,
            verification_tolerance: syncResult.verification.tolerance,
            usage_current: syncResult.usage.usageCurrent,
            usage_limit: syncResult.usage.usageLimit,
            usage_unit: syncResult.usage.usageUnit,
            input_tokens: syncResult.usage.inputTokens,
            output_tokens: syncResult.usage.outputTokens,
            cached_tokens: syncResult.usage.cachedTokens,
            requests: syncResult.usage.requests,
            cost: syncResult.usage.cost,
            currency: syncResult.usage.currency,
            raw_provider_response: syncResult.usage.rawProviderResponse,
            account_identifier: syncResult.usage.accountIdentifier,
            metadata: syncResult.usage.metadata,
            verified_at: now.toISOString(),
          });
        }
      }

      logAuditEvent("api_integration_sync_completed", { userId });

      return NextResponse.json({
        success: syncResult.success,
        message: syncResult.success ? "Sync completed" : syncResult.error,
        data: syncResult.success ? syncResult.usage : null,
      });
    } catch (syncError: any) {
      // Release lock on error
      await supabase
        .from("api_integrations")
        .update({
          last_sync_status: "failed",
          last_sync_error: syncError.message || "Sync failed",
          sync_lock_until: null,
        })
        .eq("id", integration_id);

      logAuditEvent("api_integration_sync_failed", { userId, error: syncError.message });

      return NextResponse.json({
        success: false,
        error: syncError.message || "Sync failed",
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("[api-integrations/sync] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
