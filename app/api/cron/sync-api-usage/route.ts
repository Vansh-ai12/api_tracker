import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { decryptToken } from "@/lib/encryption";
import { providerRegistry } from "@/lib/api-usage/registry";
import { ProviderCredentials } from "@/lib/api-usage/types";
import { logAuditEvent } from "@/lib/audit-logger";
import { isProUser } from "@/lib/plan";

export const dynamic = "force-dynamic";

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron/sync-api-usage] CRON_SECRET not configured");
    return false;
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error("[cron/sync-api-usage] Invalid cron secret");
    return false;
  }

  return true;
}

const SYNC_LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes for cron

export async function GET(request: Request) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    // Find automatic integrations that are enabled for sync
    const { data: integrations, error: integrationsError } = await supabase
      .from("api_integrations")
      .select("id, user_id, provider, encrypted_credentials, connection_type, sync_enabled, next_sync_at, sync_lock_until, sync_interval_minutes, metadata")
      .eq("connection_type", "automatic")
      .eq("sync_enabled", true);

    if (integrationsError) {
      console.error("[cron/sync-api-usage] Failed to fetch integrations:", integrationsError);
      return NextResponse.json({ error: "Failed to fetch integrations" }, { status: 500 });
    }

    if (!integrations || integrations.length === 0) {
      console.log("[cron/sync-api-usage] No automatic integrations to sync");
      return NextResponse.json({ success: true, message: "No integrations to sync", synced: 0 });
    }

    console.log(`[cron/sync-api-usage] Found ${integrations.length} automatic integrations`);

    let totalSynced = 0;
    let skipped = 0;
    let failed = 0;
    const now = new Date();

    const planCache = new Map<string, boolean>();

    for (const integration of integrations) {
      let userIsPro = planCache.get(integration.user_id);
      if (userIsPro === undefined) {
        userIsPro = await isProUser(integration.user_id);
        planCache.set(integration.user_id, userIsPro);
      }
      if (!userIsPro) {
        skipped++;
        continue;
      }

      // Skip if not due for sync
      if (integration.next_sync_at && new Date(integration.next_sync_at) > now) {
        skipped++;
        continue;
      }

      // Skip if locked (with stale lock recovery)
      if (integration.sync_lock_until && new Date(integration.sync_lock_until) > now) {
        skipped++;
        continue;
      }

      // Recover stale locks
      if (integration.sync_lock_until && new Date(integration.sync_lock_until) <= now) {
        console.warn(`[cron/sync-api-usage] Recovering stale sync lock for integration ${integration.id}`);
      }

      try {
        console.log(`[cron/sync-api-usage] Starting sync for integration ${integration.id} (${integration.provider})`);

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
          .eq("id", integration.id);

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
          if (syncResult.usage.requests !== undefined) updateData.usage_current = syncResult.usage.requests;
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
          .eq("id", integration.id);

        // Record usage history on successful sync
        if (syncResult.success) {
          await supabase.from("api_usage_history").insert({
            integration_id: integration.id,
            user_id: integration.user_id,
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
              user_id: integration.user_id,
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

        totalSynced++;

        if (syncResult.success) {
          console.log(`[cron/sync-api-usage] Sync completed for integration ${integration.id}`);
        } else {
          console.error(`[cron/sync-api-usage] Sync failed for integration ${integration.id}:`, syncResult.error);
          failed++;
        }
      } catch (error: any) {
        console.error(`[cron/sync-api-usage] Exception syncing integration ${integration.id}:`, error);
        
        // Release lock on error
        await supabase
          .from("api_integrations")
          .update({
            last_sync_status: "failed",
            last_sync_error: error.message || "Sync failed",
            sync_lock_until: null,
          })
          .eq("id", integration.id);
        
        failed++;
      }
    }

    console.log(`[cron/sync-api-usage] Cron job completed: ${totalSynced} synced, ${skipped} skipped, ${failed} failed`);

    return NextResponse.json({
      success: true,
      totalIntegrations: integrations.length,
      synced: totalSynced,
      skipped,
      failed,
    });
  } catch (error: any) {
    console.error("[cron/sync-api-usage] Cron job failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
