import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase-server";

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
    if (integration.connection_type !== "connected") {
      return NextResponse.json({ 
        error: "Only connected integrations can be synced automatically",
        message: "This integration is set to manual tracking. Update usage manually."
      }, { status: 400 });
    }

    // Update sync status to syncing
    await supabase
      .from("api_integrations")
      .update({
        last_sync_status: "syncing",
        last_sync_error: null,
      })
      .eq("id", integration_id);

    // Provider-specific sync logic would go here
    // For now, we'll return a placeholder response since actual provider connectors
    // need to be implemented based on each provider's API
    const syncResult = {
      usage_current: null,
      credits_remaining: null,
      error: "Automatic sync not yet implemented for this provider. Please update usage manually.",
    };

    // Update integration with sync results
    const updateData: any = {
      last_synced_at: new Date().toISOString(),
      last_sync_status: syncResult.error ? "failed" : "completed",
    };

    if (syncResult.error) {
      updateData.last_sync_error = syncResult.error;
    } else {
      if (syncResult.usage_current !== null) updateData.usage_current = syncResult.usage_current;
      if (syncResult.credits_remaining !== null) updateData.credits_remaining = syncResult.credits_remaining;
    }

    await supabase
      .from("api_integrations")
      .update(updateData)
      .eq("id", integration_id);

    return NextResponse.json({
      success: !syncResult.error,
      message: syncResult.error || "Sync completed",
      data: syncResult.error ? null : {
        usage_current: syncResult.usage_current,
        credits_remaining: syncResult.credits_remaining,
      },
    });
  } catch (error: any) {
    console.error("[api-integrations/sync] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
