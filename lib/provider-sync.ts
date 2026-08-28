import "server-only";

import { decryptToken } from "@/lib/encryption";
import { providerRegistry } from "@/lib/api-usage/registry";
import { ProviderCredentials } from "@/lib/api-usage/types";
import { createServiceClient } from "@/lib/supabase-server";

const LOCK_MS = 10 * 60 * 1000;

/** Shared by Sync Now and the scheduler; credentials never leave this module. */
export async function synchronizeIntegration(integrationId: string, trigger: "manual" | "scheduled") {
  const supabase = createServiceClient();
  const { data: integration, error } = await supabase.from("api_integrations").select("*").eq("id", integrationId).maybeSingle();
  if (error || !integration) return { ok: false, status: "failed", error: "Integration not found" };
  if (integration.connection_type !== "automatic" || !integration.sync_enabled) return { ok: false, status: "failed", error: "Automatic sync is disabled" };
  const now = new Date();
  if (integration.sync_lock_until && new Date(integration.sync_lock_until) > now) return { ok: false, status: "skipped", error: "A sync is already running" };
  const lockUntil = new Date(now.getTime() + LOCK_MS).toISOString();
  const { data: locked } = await supabase.from("api_integrations")
    .update({ last_sync_status: "syncing", last_sync_started_at: now.toISOString(), sync_lock_until: lockUntil, last_sync_error: null })
    .eq("id", integrationId).or(`sync_lock_until.is.null,sync_lock_until.lte.${now.toISOString()}`).select("id").maybeSingle();
  if (!locked) return { ok: false, status: "skipped", error: "A sync is already running" };

  const { data: run } = await supabase.from("provider_sync_runs").insert({ integration_id: integration.id, user_id: integration.user_id, provider: integration.provider, trigger, status: "started" }).select("id").maybeSingle();
  try {
    if (!integration.encrypted_credentials) throw new Error("No provider credential is stored for this integration");
    const adapter = providerRegistry.get(integration.provider);
    if (!adapter) throw new Error("This provider does not have a server-side adapter");
    const meta = integration.metadata && typeof integration.metadata === "object" ? integration.metadata : {};
    const credentials: ProviderCredentials = {
      apiKey: decryptToken(integration.encrypted_credentials), organizationId: integration.organization_id || meta.organizationId,
      projectId: integration.project_id || meta.projectId, isAdminKey: integration.provider_api_type === "admin" || meta.isAdminKey === true,
    };
    const result = await adapter.fetchUsage(credentials);
    const unavailable = result.success && result.verification?.status === "unavailable";
    const status = result.success ? (unavailable ? "unavailable" : "completed") : "failed";
    const usage = result.usage;
    const interval = integration.sync_interval_minutes || 360;
    const update: Record<string, unknown> = {
      last_sync_status: status, last_synced_at: result.success ? now.toISOString() : integration.last_synced_at,
      last_sync_error: result.success ? (unavailable ? result.verification?.reason : null) : result.error || "Sync failed",
      sync_lock_until: null, next_sync_at: new Date(now.getTime() + interval * 60_000).toISOString(), data_source: result.success ? "provider_api" : integration.data_source || "manual",
      account_identifier: usage.accountIdentifier || integration.account_identifier, verification_status: result.verification?.status || null,
      verification_checked_at: result.verification?.checkedAt || null, verification_reason: result.verification?.reason || null,
    };
    if (result.success && !unavailable) Object.assign(update, {
      usage_current: usage.usageCurrent ?? null, usage_limit: usage.usageLimit ?? null, usage_unit: usage.usageUnit ?? null,
      credits_remaining: usage.creditsRemaining ?? null, credit_limit: usage.creditLimit ?? null, cost: usage.cost ?? null,
      currency: usage.currency ?? null, reset_at: usage.resetAt ?? null, metadata: usage.metadata || meta,
    });
    await supabase.from("api_integrations").update(update).eq("id", integration.id);
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const snapshotKey = `${periodStart}|${usage.usageCurrent ?? "unavailable"}|${usage.cost ?? "unavailable"}|${status}`;
    await supabase.from("api_usage_snapshots").upsert({
      integration_id: integration.id, user_id: integration.user_id, provider: integration.provider, source: "provider_api", fetched_at: now.toISOString(),
      period_start: periodStart, period_end: now.toISOString(), project_id: credentials.projectId || null, input_tokens: usage.inputTokens ?? null,
      output_tokens: usage.outputTokens ?? null, cached_input_tokens: usage.cachedTokens ?? null, request_count: usage.requests ?? null,
      total_tokens: usage.usageCurrent ?? null, cost: usage.cost ?? null, currency: usage.currency ?? null, sync_status: status, snapshot_key: snapshotKey,
      metadata: { source: usage.metadata?.source || "provider_api", reason: result.verification?.reason || null },
    }, { onConflict: "integration_id,snapshot_key" });
    await supabase.from("provider_sync_runs").update({ status, completed_at: new Date().toISOString(), error_reason: result.success ? null : result.error || null }).eq("id", run?.id);
    return { ok: result.success, status, error: result.error || result.verification?.reason || null, usage: result.success ? usage : null };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Sync failed";
    await supabase.from("api_integrations").update({ last_sync_status: "failed", last_sync_error: message, sync_lock_until: null }).eq("id", integration.id);
    if (run?.id) await supabase.from("provider_sync_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_reason: message }).eq("id", run.id);
    return { ok: false, status: "failed", error: message };
  }
}
