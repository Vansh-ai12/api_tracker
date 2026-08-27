import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase-server";
import { encryptToken } from "@/lib/encryption";
import { providerRegistry } from "@/lib/api-usage/registry";
import { ProviderCredentials } from "@/lib/api-usage/types";
import { requireProUser, isProUser } from "@/lib/plan";

function stripCredentials(integration: Record<string, unknown>) {
  const { encrypted_credentials, ...safe } = integration;
  return safe;
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const isPro = await isProUser(userId);

  // Get user's integrations (never return credentials).
  // Free users may still list existing rows so the UI can show them as locked.
  const { data: integrations, error } = await supabase
    .from("api_integrations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api-integrations] Fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch integrations" },
      { status: 500 },
    );
  }

  const safeIntegrations =
    integrations?.map((int: Record<string, unknown>) => stripCredentials(int)) || [];

  return NextResponse.json({
    integrations: safeIntegrations,
    locked: !isPro,
  });
}

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
    const {
      service_name,
      provider,
      category,
      usage_current,
      usage_limit,
      usage_unit,
      credits_remaining,
      credit_limit,
      billing_period,
      reset_at,
      deadline_at,
      currency,
      cost,
      status,
      connection_type,
      credentials,
      notes,
    } = body;

    // Validate required fields
    if (
      !service_name ||
      typeof service_name !== "string" ||
      service_name.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Service name is required" },
        { status: 400 },
      );
    }

    if (
      !provider ||
      typeof provider !== "string" ||
      provider.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Provider is required" },
        { status: 400 },
      );
    }

    // Determine connection type based on provider
    const normalizedProvider = provider.trim().toLowerCase();
    const isAutomaticProvider = ["openai", "anthropic", "gemini"].includes(normalizedProvider);
    const isManual = connection_type === "manual" || normalizedProvider === "manual";
    
    let finalConnectionType = isManual ? "manual" : "automatic";
    let syncEnabled = !isManual;
    let encryptedCredentials = null;

    // For automatic providers, validate credentials and test connection
    if (!isManual && credentials && typeof credentials === "string") {
      const adapter = providerRegistry.get(normalizedProvider);
      
      if (!adapter) {
        return NextResponse.json(
          { error: `Provider "${provider}" is not supported for automatic tracking` },
          { status: 400 },
        );
      }

      const providerCredentials: ProviderCredentials = {
        apiKey: credentials,
      };

      // Validate credential format
      if (!adapter.validateCredentials(providerCredentials)) {
        return NextResponse.json(
          { error: `Invalid ${adapter.displayName} API key format` },
          { status: 400 },
        );
      }

      // Test connection
      const connectionValid = await adapter.testConnection(providerCredentials);
      if (!connectionValid) {
        return NextResponse.json(
          { error: `Failed to connect to ${adapter.displayName}. Please check your API key.` },
          { status: 400 },
        );
      }

      // Encrypt credentials
      encryptedCredentials = encryptToken(credentials);
    } else if (credentials && typeof credentials === "string") {
      // Manual credentials (optional)
      encryptedCredentials = encryptToken(credentials);
    }

    // Insert the integration (RLS ensures user_id matches)
    const { data: newIntegration, error: insertError } = await supabase
      .from("api_integrations")
      .insert({
        user_id: userId,
        service_name: service_name.trim(),
        provider: provider.trim(),
        category: category?.trim() || null,
        usage_current:
          usage_current !== undefined
            ? parseFloat(String(usage_current))
            : null,
        usage_limit:
          usage_limit !== undefined ? parseFloat(String(usage_limit)) : null,
        usage_unit: usage_unit || "tokens",
        credits_remaining:
          credits_remaining !== undefined
            ? parseFloat(String(credits_remaining))
            : null,
        credit_limit:
          credit_limit !== undefined ? parseFloat(String(credit_limit)) : null,
        billing_period: billing_period?.trim() || null,
        reset_at: reset_at || null,
        deadline_at: deadline_at || null,
        currency: currency || "USD",
        cost: cost !== undefined ? parseFloat(String(cost)) : null,
        status: status || "active",
        connection_type: finalConnectionType,
        sync_enabled: syncEnabled,
        encrypted_credentials: encryptedCredentials,
        notes: notes?.trim() || null,
        next_sync_at: syncEnabled ? new Date(Date.now() + 360 * 60 * 1000).toISOString() : null,
      })
      .select(
        "id, service_name, provider, category, usage_current, usage_limit, usage_unit, credits_remaining, credit_limit, billing_period, reset_at, deadline_at, currency, cost, status, connection_type, sync_enabled, last_synced_at, last_sync_status, last_sync_error, notes, created_at, updated_at",
      )
      .single();

    if (insertError || !newIntegration) {
      console.error("[api-integrations] Insert error:", {
        message: insertError?.message,
        details: insertError?.details,
        hint: insertError?.hint,
        code: insertError?.code,
      });

      return NextResponse.json(
        {
          error: "Failed to create integration",
          details:
            process.env.NODE_ENV === "development"
              ? insertError?.message || "No integration row was returned"
              : undefined,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, integration: newIntegration });
  } catch (error: any) {
    console.error("[api-integrations] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
