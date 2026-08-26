import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(
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

  // Verify ownership
  const { data: integration } = await supabase
    .from("api_integrations")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  // Get query parameters
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "30");
  const offset = parseInt(searchParams.get("offset") || "0");

  // Fetch usage history
  const { data: history, error } = await supabase
    .from("api_usage_history")
    .select("*")
    .eq("integration_id", id)
    .eq("user_id", userId)
    .order("recorded_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[api-integrations/history] Fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }

  return NextResponse.json({ history: history || [] });
}
