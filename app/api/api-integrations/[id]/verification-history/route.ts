import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase-server";
import { requireProUser } from "@/lib/plan";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forbidden = await requireProUser(userId);
  if (forbidden) return forbidden;

  const supabase = createServiceClient();

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

  // Fetch verification history
  const { data: history, error } = await supabase
    .from("api_verification_history")
    .select("*")
    .eq("integration_id", id)
    .eq("user_id", userId)
    .order("verified_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[api-integrations/verification-history] Fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch verification history" }, { status: 500 });
  }

  // Remove raw_provider_response from response for security
  const safeHistory = history?.map((item: any) => ({
    ...item,
    raw_provider_response: undefined,
  })) || [];

  return NextResponse.json({ history: safeHistory });
}
