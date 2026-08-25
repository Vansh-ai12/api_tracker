import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase-server";
import { generateGoogleAuthUrl, revokeGoogleToken } from "@/lib/gmail-oauth";
import { runGmailInboxScan } from "@/lib/subscription-scanner";
import { logAuditEvent } from "@/lib/audit-logger";
import crypto from "crypto";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: user, error } = await supabase
    .from("users")
    .select(
      "tracking_mode, gmail_connected, gmail_email, gmail_connected_at, gmail_last_scan_at, gmail_last_scan_status, gmail_last_error, forwarding_alias",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    tracking_mode: user.tracking_mode || "PRIVATE_EMAIL",
    gmail_connected: !!user.gmail_connected,
    gmail_email: user.gmail_email || null,
    gmail_connected_at: user.gmail_connected_at || null,
    gmail_last_scan_at: user.gmail_last_scan_at || null,
    gmail_last_scan_status: user.gmail_last_scan_status || "idle",
    gmail_last_error: user.gmail_last_error || null,
    forwarding_alias: user.forwarding_alias,
  });
}

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { action } = await request.json();
    const supabase = createServiceClient();

    const { data: user } = await supabase
      .from("users")
      .select("id, gmail_refresh_token, telegram_chat_id")
      .eq("id", userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (action === "connect") {
      // 1. Generate 15-minute one-time OAuth state token tied directly to this canonical user_id
      const stateToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      await supabase.from("gmail_oauth_states").insert({
        state: stateToken,
        telegram_chat_id: user.telegram_chat_id || 0,
        user_id: user.id,
        expires_at: expiresAt,
      });

      logAuditEvent("gmail_oauth_started", {
        userId: user.id,
        telegramChatId: user.telegram_chat_id || undefined,
      });

      const oauthUrl = generateGoogleAuthUrl(stateToken);
      return NextResponse.json({ success: true, oauth_url: oauthUrl });
    }

    if (action === "disconnect") {
      if (user.gmail_refresh_token) {
        await revokeGoogleToken(user.gmail_refresh_token);
      }

      await supabase
        .from("users")
        .update({
          gmail_connected: false,
          gmail_email: null,
          gmail_refresh_token: null,
          gmail_connected_at: null,
          tracking_mode: "PRIVATE_EMAIL",
          gmail_last_scan_status: "idle",
          gmail_last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      logAuditEvent("gmail_disconnected", {
        userId,
        telegramChatId: user.telegram_chat_id,
      });
      return NextResponse.json({
        success: true,
        message: "Gmail disconnected successfully",
      });
    }

    if (action === "scan") {
      const scanResult = await runGmailInboxScan(userId);

      // The scanner can return an error while still returning normally.
      // Do not report those scans as successful.
      if (scanResult.error) {
        const status =
          scanResult.error === "A scan is already in progress."
            ? 409
            : scanResult.error === "TOKEN_EXPIRED"
              ? 401
              : 500;

        return NextResponse.json(
          {
            success: false,
            ...scanResult,
          },
          { status },
        );
      }

      return NextResponse.json({
        success: true,
        ...scanResult,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("[api/user/gmail] Action error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
