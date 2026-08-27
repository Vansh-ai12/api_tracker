import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase-server";
import { decryptToken } from "@/lib/encryption";
import { providerRegistry } from "@/lib/api-usage/registry";
import { ProviderCredentials } from "@/lib/api-usage/types";
import { logAuditEvent } from "@/lib/audit-logger";

const VERIFY_LOCK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes for verification

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Check if user is Pro
  const { data: user } = await supabase
    .from("users")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();

  if (!user || user.plan !== "pro") {
    return NextResponse.json({ error: "Pro plan required" }, { status: 403 });
  }

  try {
    // Verify ownership
    const { data: integration } = await supabase
      .from("api_integrations")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    }

    // Only verify automatic integrations
    if (integration.connection_type !== "automatic") {
      return NextResponse.json({ 
        error: "Only automatic integrations can be verified",
        message: "Manual tracking integrations cannot be verified against provider data."
      }, { status: 400 });
    }

    // Check verification lock (reuse sync_lock_until for verification)
    const now = new Date();
    if (integration.sync_lock_until && new Date(integration.sync_lock_until) > now) {
      return NextResponse.json({ 
        error: "Verification already in progress",
        message: "A verification or sync is already running for this integration."
      }, { status: 409 });
    }

    // Acquire verification lock
    const lockUntil = new Date(Date.now() + VERIFY_LOCK_TIMEOUT_MS);
    await supabase
      .from("api_integrations")
      .update({
        sync_lock_until: lockUntil.toISOString(),
      })
      .eq("id", id);

    logAuditEvent("api_integration_verify_started", { userId });

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

      // Fetch usage from provider (fresh fetch)
      const syncResult = await adapter.fetchUsage(credentials);

      // Update integration with verification results only
      const updateData: any = {
        sync_lock_until: null,
      };

      if (syncResult.success && syncResult.verification) {
        // Update verification fields
        updateData.verification_status = syncResult.verification.status;
        updateData.verification_provider_total = syncResult.verification.providerTotal;
        updateData.verification_calculated_total = syncResult.verification.calculatedTotal;
        updateData.verification_difference = syncResult.verification.difference;
        updateData.verification_difference_percentage = syncResult.verification.differencePercentage;
        updateData.verification_checked_at = syncResult.verification.checkedAt;
        updateData.verification_reason = syncResult.verification.reason;
        updateData.verification_tolerance = syncResult.verification.tolerance;

        // Update account identifier
        if (syncResult.usage.accountIdentifier) {
          updateData.account_identifier = syncResult.usage.accountIdentifier;
        }

        // Also update usage data (verification implies fresh sync)
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
        
        updateData.last_synced_at = now.toISOString();
        updateData.last_sync_status = "completed";
      } else {
        // Verification failed
        updateData.verification_status = "failed";
        updateData.verification_checked_at = now.toISOString();
        updateData.verification_reason = syncResult.error || "Verification failed";
      }

      await supabase
        .from("api_integrations")
        .update(updateData)
        .eq("id", id);

      // Record verification history on successful verification
      if (syncResult.success && syncResult.verification) {
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

      logAuditEvent("api_integration_verify_completed", { userId });

      return NextResponse.json({
        success: syncResult.success,
        message: syncResult.success ? "Verification completed" : syncResult.error,
        verification: syncResult.verification,
        usage: syncResult.success ? syncResult.usage : null,
      });
    } catch (verifyError: any) {
      // Release lock on error
      await supabase
        .from("api_integrations")
        .update({
          verification_status: "failed",
          verification_checked_at: now.toISOString(),
          verification_reason: verifyError.message || "Verification failed",
          sync_lock_until: null,
        })
        .eq("id", id);

      logAuditEvent("api_integration_verify_failed", { userId, error: verifyError.message });

      return NextResponse.json({
        success: false,
        error: verifyError.message || "Verification failed",
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("[api-integrations/verify] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
