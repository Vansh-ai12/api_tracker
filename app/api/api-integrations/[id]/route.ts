import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase-server";
import { encryptToken } from "@/lib/encryption";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
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

    // Verify ownership (RLS will also enforce this)
    const { data: existing } = await supabase
      .from("api_integrations")
      .select("id")
      .eq("id", params.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    }

    // Build update object
    const updateData: any = {};
    if (service_name !== undefined) updateData.service_name = service_name.trim();
    if (provider !== undefined) updateData.provider = provider.trim();
    if (category !== undefined) updateData.category = category?.trim() || null;
    if (usage_current !== undefined) updateData.usage_current = parseFloat(String(usage_current));
    if (usage_limit !== undefined) updateData.usage_limit = parseFloat(String(usage_limit));
    if (usage_unit !== undefined) updateData.usage_unit = usage_unit;
    if (credits_remaining !== undefined) updateData.credits_remaining = parseFloat(String(credits_remaining));
    if (credit_limit !== undefined) updateData.credit_limit = parseFloat(String(credit_limit));
    if (billing_period !== undefined) updateData.billing_period = billing_period?.trim() || null;
    if (reset_at !== undefined) updateData.reset_at = reset_at || null;
    if (deadline_at !== undefined) updateData.deadline_at = deadline_at || null;
    if (currency !== undefined) updateData.currency = currency;
    if (cost !== undefined) updateData.cost = parseFloat(String(cost));
    if (status !== undefined) updateData.status = status;
    if (connection_type !== undefined) updateData.connection_type = connection_type;
    if (credentials !== undefined && typeof credentials === "string") {
      updateData.encrypted_credentials = encryptToken(credentials);
    }
    if (notes !== undefined) updateData.notes = notes?.trim() || null;

    const { data: updated, error: updateError } = await supabase
      .from("api_integrations")
      .update(updateData)
      .eq("id", params.id)
      .eq("user_id", userId)
      .select("id, service_name, provider, category, usage_current, usage_limit, usage_unit, credits_remaining, credit_limit, billing_period, reset_at, deadline_at, currency, cost, status, connection_type, last_synced_at, last_sync_status, last_sync_error, notes, created_at, updated_at")
      .single();

    if (updateError || !updated) {
      console.error("[api-integrations] Update error:", updateError);
      return NextResponse.json({ error: "Failed to update integration" }, { status: 500 });
    }

    return NextResponse.json({ success: true, integration: updated });
  } catch (error: any) {
    console.error("[api-integrations] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
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

  // Verify ownership (RLS will also enforce this)
  const { data: existing } = await supabase
    .from("api_integrations")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  const { error: deleteError } = await supabase
    .from("api_integrations")
    .delete()
    .eq("id", params.id)
    .eq("user_id", userId);

  if (deleteError) {
    console.error("[api-integrations] Delete error:", deleteError);
    return NextResponse.json({ error: "Failed to delete integration" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
