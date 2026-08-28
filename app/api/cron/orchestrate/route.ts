import { NextResponse } from "next/server";
import { runGmailInboxScan } from "@/lib/subscription-scanner";
import { isProUser } from "@/lib/plan";
import { synchronizeIntegration } from "@/lib/provider-sync";
import { createServiceClient } from "@/lib/supabase-server";
import { runRenewalReminders } from "@/lib/renewal-reminders";

export const dynamic = "force-dynamic";

/** The one scheduled entry point for Pro Gmail, provider sync, and reminders. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const [usersResult, integrationsResult] = await Promise.all([
    supabase.from("users").select("id").eq("gmail_connected", true),
    supabase.from("api_integrations").select("id,user_id,next_sync_at").eq("connection_type", "automatic").eq("sync_enabled", true),
  ]);
  if (usersResult.error || integrationsResult.error) return NextResponse.json({ error: "Unable to prepare scheduled work" }, { status: 500 });
  const pro = new Map<string, boolean>();
  const eligible = async (userId: string) => {
    if (!pro.has(userId)) pro.set(userId, await isProUser(userId));
    return pro.get(userId)!;
  };
  let gmailScans = 0; let apiSynced = 0; let failures = 0;
  for (const user of usersResult.data || []) {
    if (!(await eligible(user.id))) continue;
    const scan = await runGmailInboxScan(user.id);
    if (scan.error) failures++; else gmailScans++;
  }
  for (const integration of integrationsResult.data || []) {
    if (integration.next_sync_at && integration.next_sync_at > now) continue;
    if (!(await eligible(integration.user_id))) continue;
    const sync = await synchronizeIntegration(integration.id, "scheduled");
    if (sync.status === "completed" || sync.status === "unavailable") apiSynced++; else if (sync.status !== "skipped") failures++;
  }
  const reminders = await runRenewalReminders().catch(() => { failures++; return null; });
  return NextResponse.json({ success: true, gmailScans, apiSynced, remindersSent: reminders?.remindersSent || 0, failures });
}
