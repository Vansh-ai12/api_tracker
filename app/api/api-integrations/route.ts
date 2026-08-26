import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase-server";
import { encryptToken } from "@/lib/encryption";

export async function GET() {
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

  // Get user's integrations (RLS ensures user can only see their own)
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

  // Remove encrypted credentials from response
  const safeIntegrations =
    integrations?.map((int: any) => ({
      ...int,
      encrypted_credentials: undefined,
    })) || [];

  return NextResponse.json({ integrations: safeIntegrations });
}

export async function POST(request: Request) {
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

    // Encrypt credentials if provided
    let encryptedCredentials = null;
    if (credentials && typeof credentials === "string") {
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
        connection_type: connection_type || "manual",
        encrypted_credentials: encryptedCredentials,
        notes: notes?.trim() || null,
      })
      .select(
        "id, service_name, provider, category, usage_current, usage_limit, usage_unit, credits_remaining, credit_limit, billing_period, reset_at, deadline_at, currency, cost, status, connection_type, last_synced_at, last_sync_status, last_sync_error, notes, created_at, updated_at",
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
