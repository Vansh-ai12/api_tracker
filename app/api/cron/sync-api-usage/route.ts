import { NextResponse } from "next/server";
import { isProUser } from "@/lib/plan";
import { synchronizeIntegration } from "@/lib/provider-sync";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Kept for a safe manual backfill; production scheduling uses /cron/orchestrate. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date().toISOString();
  const { data: integrations, error } = await createServiceClient().from("api_integrations").select("id,user_id,next_sync_at").eq("connection_type", "automatic").eq("sync_enabled", true);
  if (error) return NextResponse.json({ error: "Unable to load integrations" }, { status: 500 });
  let completed = 0; let unavailable = 0; let skipped = 0; let failed = 0;
  for (const integration of integrations || []) {
    if (integration.next_sync_at && integration.next_sync_at > now || !(await isProUser(integration.user_id))) { skipped++; continue; }
    const result = await synchronizeIntegration(integration.id, "scheduled");
    if (result.status === "completed") completed++;
    else if (result.status === "unavailable") unavailable++;
    else if (result.status === "skipped") skipped++;
    else failed++;
  }
  return NextResponse.json({ success: true, completed, unavailable, skipped, failed });
}
