import { NextResponse } from "next/server";
import { requireProUser } from "@/lib/plan";
import { synchronizeIntegration } from "@/lib/provider-sync";
import { getSessionUserId } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase-server";

/** Verification is a fresh shared provider sync, not a weaker second code path. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const forbidden = await requireProUser(userId);
  if (forbidden) return forbidden;
  const { data: integration } = await createServiceClient().from("api_integrations").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!integration) return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  const result = await synchronizeIntegration(integration.id, "manual");
  return NextResponse.json({ ...result, verification: result.usage ? "fresh provider sync completed" : "unavailable" }, { status: result.status === "skipped" ? 409 : result.ok ? 200 : 502 });
}
