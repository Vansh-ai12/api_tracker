import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { exchangeCodeForTokens } from "@/lib/gmail-oauth";
import { encryptToken } from "@/lib/encryption";
import { logAuditEvent } from "@/lib/audit-logger";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const botUsername = "UnsubGbot";
  const botUrl = `https://t.me/${botUsername}`;

  if (errorParam || !state || !code) {
    console.warn("[gmail-callback] OAuth canceled or invalid parameters:", { errorParam, state: !!state, code: !!code });
    logAuditEvent("gmail_oauth_failed", { error: errorParam || "Missing state or code" });

    return new NextResponse(
      renderHtmlResponse({
        title: "Gmail Setup Canceled",
        heading: "⚠️ Setup Not Completed",
        message: "Google authorization was canceled or failed. You can safely return to Telegram.",
        botUrl,
        success: false,
      }),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const supabase = createServiceClient();

  // 1. Look up one-time state in database
  const { data: stateRecord, error: stateLookupErr } = await supabase
    .from("gmail_oauth_states")
    .select("id, state, telegram_chat_id, user_id, expires_at")
    .eq("state", state)
    .maybeSingle();

  if (stateLookupErr || !stateRecord) {
    console.error("[gmail-callback] Invalid or unrecognized OAuth state:", stateLookupErr);
    logAuditEvent("gmail_oauth_failed", { error: "Unrecognized OAuth state" });

    return new NextResponse(
      renderHtmlResponse({
        title: "Session Expired",
        heading: "❌ Invalid or Expired Link",
        message: "This authorization link has expired or was already used. Please request a new setup link in Telegram.",
        botUrl,
        success: false,
      }),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  // 2. Consume / delete state immediately to prevent replay attacks
  await supabase.from("gmail_oauth_states").delete().eq("id", stateRecord.id);

  // 3. Verify state has not expired
  if (new Date(stateRecord.expires_at) < new Date()) {
    logAuditEvent("gmail_oauth_failed", { error: "Expired OAuth state", telegramChatId: stateRecord.telegram_chat_id });
    return new NextResponse(
      renderHtmlResponse({
        title: "Link Expired",
        heading: "⏰ Link Expired",
        message: "This authorization link expired after 15 minutes. Please try again from Telegram.",
        botUrl,
        success: false,
      }),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  try {
    // 4. Exchange authorization code with Google for tokens & user email
    const { refreshToken, gmailEmail } = await exchangeCodeForTokens(code);

    if (!refreshToken) {
      console.error("[gmail-callback] No refresh token returned by Google");
      return new NextResponse(
        renderHtmlResponse({
          title: "Re-authorization Required",
          heading: "⚠️ Permission Error",
          message: "Google did not grant offline access. Please remove Unsub from your Google Account permissions and try again.",
          botUrl,
          success: false,
        }),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // 5. Encrypt refresh token with AES-256-GCM
    const encryptedRefreshToken = encryptToken(refreshToken);

    // 6. Resolve canonical user record
    let targetUserId = stateRecord.user_id;

    if (!targetUserId) {
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_chat_id", stateRecord.telegram_chat_id)
        .maybeSingle();

      if (existingUser) {
        targetUserId = existingUser.id;
      }
    }

    if (!targetUserId) {
      throw new Error("Could not find matching application user for state.");
    }

    // 7. Update canonical user atomically
    const { error: updateErr } = await supabase
      .from("users")
      .update({
        gmail_connected: true,
        tracking_mode: "GMAIL",
        gmail_email: gmailEmail,
        gmail_refresh_token: encryptedRefreshToken,
        gmail_connected_at: new Date().toISOString(),
        gmail_last_scan_status: "idle",
        gmail_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetUserId);

    if (updateErr) {
      console.error("[gmail-callback] User update error:", updateErr);
      throw new Error("Failed to save connection in database.");
    }

    logAuditEvent("gmail_oauth_completed", {
      userId: targetUserId,
      telegramChatId: stateRecord.telegram_chat_id,
    });

    // 8. Notify user in Telegram
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token && stateRecord.telegram_chat_id) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: stateRecord.telegram_chat_id,
          text:
            `✅ *Gmail connected successfully\\!*\n\n` +
            `Unsub can now analyze your inbox for subscription emails\\.\n\n` +
            `*Gmail account:*\n\`${escapeMarkdown(gmailEmail)}\``,
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "📬 Scan Inbox", callback_data: "scan_inbox" },
                { text: "⚙️ Gmail Settings", callback_data: "gmail_settings" },
              ],
              [{ text: "❌ Disconnect Gmail", callback_data: "disconnect_gmail" }],
            ],
          },
        }),
      });
    }

    // 9. Render success page
    return new NextResponse(
      renderHtmlResponse({
        title: "Gmail Connected!",
        heading: "✅ Gmail Connected Successfully",
        message: `Your Gmail account (${gmailEmail}) has been securely connected to Unsub. You can return to Telegram or your web dashboard.`,
        botUrl,
        success: true,
      }),
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err: any) {
    console.error("[gmail-callback] Callback processing failed:", err);
    logAuditEvent("gmail_oauth_failed", { error: err.message });

    return new NextResponse(
      renderHtmlResponse({
        title: "Connection Failed",
        heading: "❌ Setup Error",
        message: "An error occurred while connecting your Gmail account. Please try again.",
        botUrl,
        success: false,
      }),
      { headers: { "Content-Type": "text/html" } }
    );
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

function renderHtmlResponse(opts: {
  title: string;
  heading: string;
  message: string;
  botUrl: string;
  success: boolean;
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title} | Unsub</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #0a0a0a;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .card {
      background: #141414;
      border: 1px solid #262626;
      border-radius: 20px;
      padding: 40px 32px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 12px;
      color: ${opts.success ? "#10b981" : "#f43f5e"};
    }
    p {
      font-size: 14px;
      color: #a3a3a3;
      line-height: 1.6;
      margin-bottom: 28px;
    }
    .btn {
      display: inline-block;
      background-color: #10b981;
      color: #ffffff;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      padding: 12px 28px;
      border-radius: 9999px;
      transition: background-color 0.2s;
    }
    .btn:hover {
      background-color: #059669;
    }
    .secondary-btn {
      background-color: transparent;
      border: 1px solid #404040;
      color: #d4d4d4;
      margin-top: 12px;
    }
    .secondary-btn:hover {
      background-color: #262626;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${opts.heading}</h1>
    <p>${opts.message}</p>
    <div>
      <a href="${opts.botUrl}" class="btn">Open Telegram App</a>
      <br>
      <a href="/dashboard" class="btn secondary-btn">Go to Web Dashboard</a>
    </div>
  </div>
</body>
</html>`;
}
