import { NextResponse } from "next/server";
import { requireProUser } from "@/lib/plan";
import { synchronizeIntegration } from "@/lib/provider-sync";
import { getSessionUserId } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const forbidden = await requireProUser(userId);
  if (forbidden) return forbidden;
  const { integration_id: integrationId } = await request.json().catch(() => ({}));
  if (typeof integrationId !== "string") return NextResponse.json({ error: "Integration ID required" }, { status: 400 });
  const { data: integration } = await createServiceClient().from("api_integrations").select("id").eq("id", integrationId).eq("user_id", userId).maybeSingle();
  if (!integration) return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  const result = await synchronizeIntegration(integration.id, "manual");
  return NextResponse.json(result, { status: result.status === "skipped" ? 409 : result.ok ? 200 : 502 });
}
