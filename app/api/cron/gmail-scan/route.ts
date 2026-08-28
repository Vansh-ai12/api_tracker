import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { runGmailInboxScan } from "@/lib/subscription-scanner";
import { logAuditEvent } from "@/lib/audit-logger";
import { isProUser } from "@/lib/plan";

export const dynamic = "force-dynamic";

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron/gmail-scan] CRON_SECRET not configured");
    return false;
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error("[cron/gmail-scan] Invalid cron secret");
    return false;
  }

  return true;
}

export async function GET(request: Request) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    // Find users who have Gmail connected
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, gmail_connected, gmail_last_scan_at, gmail_last_scan_status")
      .eq("gmail_connected", true)
      .eq("tracking_mode", "GMAIL");

    if (usersError) {
      console.error("[cron/gmail-scan] Failed to fetch users:", usersError);
      return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }

    if (!users || users.length === 0) {
      console.log("[cron/gmail-scan] No users with Gmail connected");
      return NextResponse.json({ success: true, message: "No users to scan", scanned: 0 });
    }

    console.log(`[cron/gmail-scan] Found ${users.length} users with Gmail connected`);

    // Filter to Pro users only
    const planCache = new Map<string, boolean>();
    const proUsers = [];
    for (const user of users) {
      let userIsPro = planCache.get(user.id);
      if (userIsPro === undefined) {
        userIsPro = await isProUser(user.id);
        planCache.set(user.id, userIsPro);
      }
      if (userIsPro) {
        proUsers.push(user);
      }
    }

    if (proUsers.length === 0) {
      console.log("[cron/gmail-scan] No Pro users with Gmail connected");
      return NextResponse.json({ success: true, message: "No Pro users to scan", scanned: 0 });
    }

    console.log(`[cron/gmail-scan] Found ${proUsers.length} Pro users with Gmail connected`);

    let totalScanned = 0;
    let totalNew = 0;
    let totalUpdated = 0;
    let skipped = 0;
    let failed = 0;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const user of proUsers) {
      // Skip if already scanned in the last 24 hours
      if (user.gmail_last_scan_at) {
        const lastScan = new Date(user.gmail_last_scan_at);
        if (lastScan > oneDayAgo) {
          skipped++;
          continue;
        }
      }

      // Skip if currently scanning (with stale lock recovery handled by scanner)
      if (user.gmail_last_scan_status === "scanning") {
        const { data: lockUser } = await supabase
          .from("users")
          .select("updated_at")
          .eq("id", user.id)
          .single();

        const lockAgeMs = lockUser?.updated_at
          ? Date.now() - new Date(lockUser.updated_at).getTime()
          : 0;

        // Skip if lock is fresh (< 10 minutes old)
        if (lockAgeMs < 10 * 60 * 1000) {
          skipped++;
          continue;
        }

        console.warn(`[cron/gmail-scan] Recovering stale scan lock for user ${user.id}`);
      }

      try {
        console.log(`[cron/gmail-scan] Starting scan for user ${user.id}`);
        const result = await runGmailInboxScan(user.id);

        totalScanned += result.scannedCount;
        totalNew += result.newSubscriptionsCount;
        totalUpdated += result.updatedSubscriptionsCount;

        if (result.error) {
          console.error(`[cron/gmail-scan] Scan failed for user ${user.id}:`, result.error);
          failed++;
        } else {
          console.log(`[cron/gmail-scan] Scan completed for user ${user.id}:`, result);
        }
      } catch (error: any) {
        console.error(`[cron/gmail-scan] Exception scanning user ${user.id}:`, error);
        failed++;
      }
    }

    logAuditEvent("cron_gmail_scan_completed", {
      subscriptionCount: totalNew + totalUpdated,
    });

    return NextResponse.json({
      success: true,
      totalUsers: users.length,
      scanned: totalScanned,
      skipped,
      failed,
      newSubscriptions: totalNew,
      updatedSubscriptions: totalUpdated,
    });
  } catch (error: any) {
    console.error("[cron/gmail-scan] Cron job failed:", error);
    logAuditEvent("cron_gmail_scan_failed", { error: error.message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
