import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { generateGoogleAuthUrl, revokeGoogleToken } from "@/lib/gmail-oauth";
import { runGmailInboxScan } from "@/lib/subscription-scanner";
import { logAuditEvent } from "@/lib/audit-logger";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

function generateAlias(length = 6) {
  const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
  let alias = "";
  for (let i = 0; i < length; i++) {
    alias += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return alias;
}

async function generateUniqueAlias() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const alias = generateAlias();
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq("forwarding_alias", alias)
      .maybeSingle();

    if (error) throw error;
    if (!data) return alias;
  }
  throw new Error("Could not generate a unique alias");
}

/**
 * Safely resolves or creates the Telegram user record.
 * Guarantees exactly ONE canonical record per user.
 */
async function getOrCreateTelegramUser(chatId: number, username?: string) {
  const { data: existingUser } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (existingUser) {
    return existingUser;
  }

  const alias = await generateUniqueAlias();
  const { data: newUser, error: insertErr } = await supabase
    .from("users")
    .insert({
      telegram_chat_id: chatId,
      telegram_username: username || null,
      forwarding_alias: alias,
      plan: "free",
    })
    .select("*")
    .single();

  if (newUser) {
    return newUser;
  }

  if (insertErr) {
    console.error("[telegram-webhook] User insert error:", insertErr);
  }

  // Fallback in case of concurrent insert
  const { data: fallbackUser } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  return (
    fallbackUser || {
      id: "temp",
      forwarding_alias: alias,
      telegram_chat_id: chatId,
      plan: "free",
      auth_user_id: null,
      gmail_connected: false,
      gmail_email: null,
      tracking_mode: "PRIVATE_EMAIL",
    }
  );
}

/**
 * Merges an orphan Telegram-only user record into a canonical website user record.
 */
async function mergeOrphanTelegramUser(orphanUserId: string, canonicalUserId: string) {
  if (orphanUserId === canonicalUserId) return;

  console.log(`[telegram-webhook] Merging orphan user (${orphanUserId}) into canonical user (${canonicalUserId})...`);

  // 1. Fetch orphan user data
  const { data: orphan } = await supabase
    .from("users")
    .select("*")
    .eq("id", orphanUserId)
    .maybeSingle();

  const { data: canonical } = await supabase
    .from("users")
    .select("*")
    .eq("id", canonicalUserId)
    .maybeSingle();

  if (!orphan || !canonical) return;

  // 2. Migrate subscriptions
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("id, service_name")
    .eq("user_id", orphanUserId);

  if (subs && subs.length > 0) {
    for (const sub of subs) {
      const { data: existingSub } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", canonicalUserId)
        .ilike("service_name", sub.service_name)
        .maybeSingle();

      if (existingSub) {
        await supabase
          .from("subscription_evidence")
          .update({ subscription_id: existingSub.id, user_id: canonicalUserId })
          .eq("subscription_id", sub.id);
        await supabase.from("subscriptions").delete().eq("id", sub.id);
      } else {
        await supabase
          .from("subscriptions")
          .update({ user_id: canonicalUserId })
          .eq("id", sub.id);
      }
    }
  }

  // 3. Migrate related records
  await supabase
    .from("subscription_evidence")
    .update({ user_id: canonicalUserId })
    .eq("user_id", orphanUserId);

  await supabase
    .from("usage_reports")
    .update({ user_id: canonicalUserId })
    .eq("user_id", orphanUserId);

  await supabase
    .from("raw_emails")
    .update({ user_id: canonicalUserId })
    .eq("user_id", orphanUserId);

  await supabase
    .from("web_sessions")
    .update({ user_id: canonicalUserId })
    .eq("user_id", orphanUserId);

  await supabase
    .from("gmail_oauth_states")
    .update({ user_id: canonicalUserId })
    .eq("user_id", orphanUserId);

  // 4. Null out telegram_chat_id on orphan to avoid unique constraint conflict
  await supabase
    .from("users")
    .update({ telegram_chat_id: null })
    .eq("id", orphanUserId);

  // 5. Transfer Gmail credentials if canonical doesn't have them
  if (orphan.gmail_connected && !canonical.gmail_connected) {
    await supabase
      .from("users")
      .update({
        gmail_connected: true,
        gmail_email: orphan.gmail_email,
        gmail_refresh_token: orphan.gmail_refresh_token,
        gmail_connected_at: orphan.gmail_connected_at,
        tracking_mode: orphan.tracking_mode || "GMAIL",
      })
      .eq("id", canonicalUserId);
  }

  // 6. Delete orphan user row
  await supabase.from("users").delete().eq("id", orphanUserId);
  console.log(`[telegram-webhook] ✅ Orphan user merged and deleted.`);
}

async function safeUpdateUser(userId: string, payload: Record<string, any>) {
  const { error } = await supabase
    .from("users")
    .update(payload)
    .eq("id", userId);
  if (error) {
    console.warn("[telegram-webhook] Extended update warning:", error.message);
    const fallbackPayload: Record<string, any> = {};
    if (payload.tracking_mode) {
      fallbackPayload.tracking_method =
        payload.tracking_mode === "GMAIL" ? "gmail" : "forwarding";
    }
    await supabase.from("users").update(fallbackPayload).eq("id", userId);
  }
}

async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyMarkup?: any,
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        }),
      },
    );

    if (!res.ok) {
      const errBody = await res.text();
      console.error(
        `[telegram-webhook] sendMessage failed (${res.status}):`,
        errBody,
      );
    }
  } catch (err) {
    console.error("[telegram-webhook] Fetch error:", err);
  }
}

export async function POST(request: Request) {
  try {
    const update = await request.json();

    console.log(
      "[telegram-webhook] Incoming update:",
      JSON.stringify(update, null, 2),
    );

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error("TELEGRAM_BOT_TOKEN is missing");
      return NextResponse.json(
        { ok: false, error: "Telegram token missing" },
        { status: 500 },
      );
    }

    const domain = process.env.UNSUB_EMAIL_DOMAIN || "unsub.app";

    // =========================================================================
    // 1. Handle Inline Keyboard Button Clicks (Callback Queries)
    // =========================================================================
    if (update?.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery?.message?.chat?.id ?? callbackQuery?.from?.id;
      const callbackData = callbackQuery?.data;

      if (!chatId || !callbackData) {
        return NextResponse.json({ ok: true });
      }

      const [action, subscriptionId] = callbackData.split(":");

      // Acknowledge callback query
      await fetch(
        `https://api.telegram.org/bot${token}/answerCallbackQuery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: callbackQuery.id,
            text: `Processing ${action.replaceAll("_", " ")}...`,
            show_alert: false,
          }),
        },
      ).catch(() => null);

      // Safely look up canonical user record
      const user = await getOrCreateTelegramUser(
        chatId,
        callbackQuery.from?.username,
      );
      const alias = user.forwarding_alias || "alias";
      const unsubEmail = `${alias}@${domain}`;

      // ACTION: CONNECT GMAIL
      if (action === "connect_gmail") {
        if (user.gmail_connected && user.gmail_email) {
          await sendTelegramMessage(
            chatId,
            `✅ <b>Gmail is already connected!</b>\n\n` +
              `Account:\n<code>${user.gmail_email}</code>\n\n` +
              `Unsub is active and analyzing your inbox. What would you like to do?`,
            {
              inline_keyboard: [
                [
                  { text: "📬 Scan Inbox", callback_data: "scan_inbox" },
                  { text: "⚙️ Gmail Settings", callback_data: "gmail_settings" },
                ],
                [
                  { text: "❌ Disconnect Gmail", callback_data: "disconnect_gmail" },
                  { text: "❓ Help", callback_data: "help_menu" },
                ],
              ],
            },
          );
          return NextResponse.json({ ok: true });
        }

        // Generate 15-minute one-time OAuth state token tied to canonical user
        const stateToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        const missingGoogleEnv = [
          "GOOGLE_CLIENT_ID",
          "GOOGLE_CLIENT_SECRET",
          "GOOGLE_REDIRECT_URI",
        ].filter((key) => !process.env[key]);

        if (missingGoogleEnv.length > 0) {
          await sendTelegramMessage(
            chatId,
            `⚠️ <b>Gmail connection is temporarily unavailable.</b>\n\n` +
              `The Gmail integration is not fully configured on the server yet.\n\n` +
              `Please try again in a moment or use <b>Private Inbox mode</b> to forward your receipts.`,
            {
              inline_keyboard: [
                [{ text: "🔒 Keep Inbox Private", callback_data: "keep_inbox_private" }],
                [{ text: "❓ Help", callback_data: "help_menu" }],
              ],
            },
          );

          return NextResponse.json({ ok: false, error: "Gmail OAuth configuration missing" });
        }

        await supabase.from("gmail_oauth_states").insert({
          state: stateToken,
          telegram_chat_id: chatId,
          user_id: user.id,
          expires_at: expiresAt,
        });

        logAuditEvent("gmail_oauth_started", {
          userId: user.id,
          telegramChatId: chatId,
        });

        const googleOAuthUrl = generateGoogleAuthUrl(stateToken);

        await sendTelegramMessage(
          chatId,
          `🔗 <b>Connect your Gmail account securely</b>\n\n` +
            `Unsub requests <b>minimum read-only access</b> to identify subscription and receipt emails.\n\n` +
            `<i>Unsub cannot send, modify, or delete your emails.</i>\n\n` +
            `Click the button below to open Google's secure authorization page:`,
          {
            inline_keyboard: [
              [{ text: "🔗 Connect your Gmail", url: googleOAuthUrl }],
              [
                { text: "🔒 Keep Inbox Private", callback_data: "keep_inbox_private" },
                { text: "❓ Help", callback_data: "help_menu" },
              ],
            ],
          },
        );
      }

      // ACTION: KEEP INBOX PRIVATE
      if (action === "keep_inbox_private" || action === "private_forwarding") {
        if (user.gmail_connected) {
          await sendTelegramMessage(
            chatId,
            `⚠️ <b>Gmail is currently connected</b>\n\n` +
              `Switching to Private Inbox mode will stop Gmail access and disconnect your connected account (<code>${user.gmail_email}</code>).\n\n` +
              `Do you want to disconnect Gmail now?`,
            {
              inline_keyboard: [
                [{ text: "Disconnect Gmail & Use Private Inbox", callback_data: "confirm_switch_private" }],
                [{ text: "Keep Gmail Connected", callback_data: "keep_gmail_connected" }],
              ],
            },
          );
          return NextResponse.json({ ok: true });
        }

        await safeUpdateUser(user.id, {
          tracking_mode: "PRIVATE_EMAIL",
          updated_at: new Date().toISOString(),
        });

        logAuditEvent("private_mode_enabled", {
          userId: user.id,
          telegramChatId: chatId,
        });

        await sendTelegramMessage(
          chatId,
          `🔒 <b>Inbox Privacy Mode Enabled</b>\n\n` +
            `Unsub will <b>not</b> access your Gmail inbox.\n\n` +
            `Instead, forward subscription & receipt emails to your personal Unsub address:\n\n` +
            `📧 <code>${unsubEmail}</code>\n\n` +
            `Our AI automatically extracts the subscription details and reminds you 3 days before renewal dates!`,
          {
            inline_keyboard: [
              [{ text: "📧 How to Forward Emails", callback_data: "how_to_forward" }],
              [
                { text: "🔗 My Unsub Address", callback_data: "my_unsub_address" },
                { text: "⚙️ Privacy Settings", callback_data: "privacy_settings" },
              ],
              [
                { text: "🔗 Connect Gmail Instead", callback_data: "connect_gmail" },
                { text: "❓ Help", callback_data: "help_menu" },
              ],
            ],
          },
        );
      }

      // ACTION: CONFIRM SWITCH TO PRIVATE
      if (action === "confirm_switch_private") {
        if (user.gmail_refresh_token) {
          await revokeGoogleToken(user.gmail_refresh_token);
        }

        await safeUpdateUser(user.id, {
          gmail_connected: false,
          gmail_email: null,
          gmail_refresh_token: null,
          gmail_connected_at: null,
          tracking_mode: "PRIVATE_EMAIL",
          gmail_last_scan_status: "idle",
          gmail_last_error: null,
          updated_at: new Date().toISOString(),
        });

        logAuditEvent("gmail_disconnected", {
          userId: user.id,
          telegramChatId: chatId,
        });

        await sendTelegramMessage(
          chatId,
          `🔒 <b>Gmail Disconnected & Private Inbox Enabled</b>\n\n` +
            `Your stored Google credentials have been erased. Unsub no longer has access to your Gmail.\n\n` +
            `Forward your receipts to: <code>${unsubEmail}</code>`,
          {
            inline_keyboard: [
              [{ text: "📧 How to Forward Emails", callback_data: "how_to_forward" }],
              [
                { text: "🔗 My Unsub Address", callback_data: "my_unsub_address" },
                { text: "🔗 Connect Gmail", callback_data: "connect_gmail" },
              ],
            ],
          },
        );
      }

      if (action === "keep_gmail_connected") {
        await sendTelegramMessage(
          chatId,
          `🟢 <b>Gmail stays connected!</b>\n\nYour Gmail integration remains active.`,
          {
            inline_keyboard: [
              [
                { text: "📬 Scan Inbox", callback_data: "scan_inbox" },
                { text: "⚙️ Gmail Settings", callback_data: "gmail_settings" },
              ],
            ],
          },
        );
      }

      // ACTION: DISCONNECT GMAIL
      if (action === "disconnect_gmail") {
        if (user.gmail_refresh_token) {
          await revokeGoogleToken(user.gmail_refresh_token);
        }

        await safeUpdateUser(user.id, {
          gmail_connected: false,
          gmail_email: null,
          gmail_refresh_token: null,
          gmail_connected_at: null,
          tracking_mode: "PRIVATE_EMAIL",
          gmail_last_scan_status: "idle",
          gmail_last_error: null,
          updated_at: new Date().toISOString(),
        });

        logAuditEvent("gmail_disconnected", {
          userId: user.id,
          telegramChatId: chatId,
        });

        await sendTelegramMessage(
          chatId,
          `❌ <b>Gmail disconnected successfully.</b>\n\n` +
            `Unsub has revoked access and deleted your stored credentials. Tracking mode set to Private Inbox.\n\n` +
            `You can still track receipts by forwarding them to: <code>${unsubEmail}</code>`,
          {
            inline_keyboard: [
              [{ text: "🔗 Reconnect Gmail", callback_data: "connect_gmail" }],
              [{ text: "📧 How to Forward Emails", callback_data: "how_to_forward" }],
            ],
          },
        );
      }

      // ACTION: SCAN INBOX
      if (action === "scan_inbox") {
        if (!user.gmail_connected) {
          await sendTelegramMessage(
            chatId,
            "⚠️ <b>Gmail is not connected</b>\n\nPlease connect your Gmail account to scan for subscriptions.",
            {
              inline_keyboard: [
                [{ text: "🔗 Connect Gmail", callback_data: "connect_gmail" }],
                [{ text: "🔒 Keep Inbox Private", callback_data: "keep_inbox_private" }],
              ],
            },
          );
          return NextResponse.json({ ok: true });
        }

        if (user.gmail_last_scan_status === "scanning") {
          await sendTelegramMessage(
            chatId,
            "⏳ <b>A scan is already in progress.</b>\n\nPlease wait a moment while we process recent messages.",
          );
          return NextResponse.json({ ok: true });
        }

        await sendTelegramMessage(
          chatId,
          "🔎 <b>Scanning your inbox...</b>\n\nI'm analyzing recent subscription and receipt emails.\n\nPlease wait.",
        );

        // Execute scan asynchronously
        (async () => {
          try {
            const res = await runGmailInboxScan(user.id);

            if (res.error === "TOKEN_EXPIRED") {
              await sendTelegramMessage(
                chatId,
                `⚠️ <b>Google authorization expired or revoked</b>\n\n` +
                  `Your Gmail token is no longer valid. Please reconnect your Gmail account to resume inbox scanning.`,
                {
                  inline_keyboard: [
                    [{ text: "🔗 Reconnect Gmail", callback_data: "connect_gmail" }],
                    [{ text: "🔒 Keep Inbox Private", callback_data: "keep_inbox_private" }],
                  ],
                },
              );
            } else if (res.error) {
              await sendTelegramMessage(
                chatId,
                `❌ <b>Scan could not be completed.</b>\n\n` +
                  `Reason:\n<code>${res.error}</code>\n\n` +
                  `Your Gmail connection is still recorded. You can try again or check settings.`,
                {
                  inline_keyboard: [
                    [
                      { text: "🔄 Try Again", callback_data: "scan_inbox" },
                      { text: "⚙️ Gmail Settings", callback_data: "gmail_settings" },
                    ],
                    [{ text: "❌ Disconnect Gmail", callback_data: "disconnect_gmail" }],
                  ],
                },
              );
            } else {
              await sendTelegramMessage(
                chatId,
                `✅ <b>Scan complete!</b>\n\n` +
                  `• Candidate emails scanned: <b>${res.scannedCount}</b>\n` +
                  `• New subscriptions tracked: <b>${res.newSubscriptionsCount}</b>\n` +
                  `• Subscriptions updated: <b>${res.updatedSubscriptionsCount}</b>\n\n` +
                  `Your dashboard and renewal alerts have been updated.`,
                {
                  inline_keyboard: [
                    [
                      { text: "📬 Scan Again", callback_data: "scan_inbox" },
                      { text: "⚙️ Gmail Settings", callback_data: "gmail_settings" },
                    ],
                    [
                      { text: "📊 Check Status", callback_data: "check_status" },
                      { text: "❓ Help", callback_data: "help_menu" },
                    ],
                  ],
                },
              );
            }
          } catch (err: any) {
            console.error("Async scan error:", err);
            await sendTelegramMessage(
              chatId,
              "❌ Failed to scan inbox. Please try again in a few moments.",
              {
                inline_keyboard: [
                  [{ text: "🔄 Try Again", callback_data: "scan_inbox" }],
                  [{ text: "❓ Help", callback_data: "help_menu" }],
                ],
              },
            );
          }
        })();
      }

      // ACTION: GMAIL SETTINGS
      if (action === "gmail_settings") {
        const lastScan = user.gmail_last_scan_at
          ? new Date(user.gmail_last_scan_at).toLocaleString("en-IN")
          : "Never";

        await sendTelegramMessage(
          chatId,
          `⚙️ <b>Gmail Connection Details</b>\n\n` +
            `• Connected Account: <code>${user.gmail_email || "Unknown"}</code>\n` +
            `• Access: 🟢 Read-Only (Receipts & Invoices)\n` +
            `• Last Inbox Scan: ${lastScan}\n` +
            `• Scan Status: <code>${user.gmail_last_scan_status || "idle"}</code>\n`,
          {
            inline_keyboard: [
              [
                { text: "📬 Scan Inbox", callback_data: "scan_inbox" },
                { text: "❌ Disconnect Gmail", callback_data: "disconnect_gmail" },
              ],
              [{ text: "❓ Help", callback_data: "help_menu" }],
            ],
          },
        );
      }

      // ACTION: HELP MENU
      if (action === "help_menu") {
        await sendTelegramMessage(
          chatId,
          `❓ <b>Unsub Help & Commands</b>\n\n` +
            `Unsub tracks your recurring subscriptions and alerts you 3 days before renewal dates so you never get surprised by recurring charges.\n\n` +
            `<b>Available Modes:</b>\n` +
            `1️⃣ <b>Gmail Mode:</b> Read-only scan of receipts and invoices.\n` +
            `2️⃣ <b>Private Mode:</b> Forward receipt emails to <code>${unsubEmail}</code>.\n\n` +
            `<b>Commands:</b>\n` +
            `• /start — Main menu & onboarding\n` +
            `• /status — Check account & tracking state\n` +
            `• /privacy — Privacy guarantee & policy\n` +
            `• /help — Show this help guide\n` +
            `• /disconnect — Disconnect Gmail`,
          {
            inline_keyboard: [
              [
                { text: "📊 Check Status", callback_data: "check_status" },
                { text: "🛡️ Privacy", callback_data: "privacy_settings" },
              ],
              [
                user.gmail_connected
                  ? { text: "📬 Scan Inbox", callback_data: "scan_inbox" }
                  : { text: "🔗 Connect Gmail", callback_data: "connect_gmail" },
                { text: "📧 Forwarding Guide", callback_data: "how_to_forward" },
              ],
            ],
          },
        );
      }

      // ACTION: CHECK STATUS
      if (action === "check_status") {
        const modeLabel = user.gmail_connected
          ? `🟢 Gmail Connected (<code>${user.gmail_email}</code>)`
          : `🔒 Private Forwarding`;

        const lastScan = user.gmail_last_scan_at
          ? new Date(user.gmail_last_scan_at).toLocaleString("en-IN")
          : "None";

        await sendTelegramMessage(
          chatId,
          `📊 <b>Your Unsub Account Status</b>\n\n` +
            `• Chat ID: <code>${chatId}</code>\n` +
            `• Tracking Mode: ${modeLabel}\n` +
            `• Personal Address: <code>${unsubEmail}</code>\n` +
            `• Last Scan: ${lastScan}\n` +
            `• Plan: <b>${(user.plan || "free").toUpperCase()}</b>\n`,
          {
            inline_keyboard: [
              user.gmail_connected
                ? [{ text: "📬 Scan Inbox", callback_data: "scan_inbox" }]
                : [{ text: "🔗 Connect Gmail", callback_data: "connect_gmail" }],
              [{ text: "❓ Help", callback_data: "help_menu" }],
            ],
          },
        );
      }

      // ACTION: HOW TO FORWARD
      if (action === "how_to_forward") {
        await sendTelegramMessage(
          chatId,
          `📖 <b>How to Forward Receipts to Unsub</b>\n\n` +
            `1️⃣ Open any receipt email (Netflix, Spotify, ChatGPT, Canva, AWS, etc.)\n` +
            `2️⃣ Click <b>Forward</b>\n` +
            `3️⃣ Send to: <code>${unsubEmail}</code>\n\n` +
            `💡 <i>Pro-tip:</i> Set up an automated auto-forwarding filter in Gmail or Outlook for emails containing 'receipt', 'invoice', or 'subscription'!`,
          {
            inline_keyboard: [
              [{ text: "🔗 My Unsub Address", callback_data: "my_unsub_address" }],
              [{ text: "❓ Help", callback_data: "help_menu" }],
            ],
          },
        );
      }

      // ACTION: MY UNSUB ADDRESS
      if (action === "my_unsub_address") {
        await sendTelegramMessage(
          chatId,
          `📧 <b>Your Personal Unsub Forwarding Address</b>\n\n` +
            `<code>${unsubEmail}</code>\n\n` +
            `Tap the text above to copy your unique address!`,
          {
            inline_keyboard: [
              [{ text: "📧 How to Forward Emails", callback_data: "how_to_forward" }],
              [{ text: "❓ Help", callback_data: "help_menu" }],
            ],
          },
        );
      }

      // ACTION: PRIVACY SETTINGS
      if (action === "privacy_settings") {
        await sendTelegramMessage(
          chatId,
          `🛡️ <b>Unsub Privacy Guarantee</b>\n\n` +
            `• We request <b>minimum read-only access</b> strictly to search for receipts and invoices.\n` +
            `• We <b>never</b> sell user data, train general AI models on your emails, or share data for advertising.\n` +
            `• Google OAuth refresh tokens are encrypted at rest with <b>AES-256-GCM</b>.\n` +
            `• You can disconnect Gmail at any time to permanently revoke access and purge credentials.\n\n` +
            `Read our full Privacy Policy at:\nhttps://api-tracker-dun.vercel.app/privacy`,
          {
            inline_keyboard: [
              [{ text: "❓ Help", callback_data: "help_menu" }],
            ],
          },
        );
      }

      // Existing subscription reminder actions
      if (action === "still_using" && subscriptionId) {
        await supabase.from("usage_reports").insert({
          subscription_id: subscriptionId,
          user_id: user.id,
          source: "self_report",
          used: true,
        });
        await sendTelegramMessage(
          chatId,
          `✅ Great!\n\nWe'll keep tracking this subscription and remind you before the next renewal.`,
        );
      }

      if (action === "mark_cancelled" && subscriptionId) {
        await supabase
          .from("subscriptions")
          .update({ status: "cancelled" })
          .eq("id", subscriptionId)
          .eq("user_id", user.id);
        await sendTelegramMessage(
          chatId,
          `🗑️ Subscription marked as cancelled and removed from active alerts.`,
        );
      }

      if (action === "remind_later") {
        await sendTelegramMessage(chatId, `⏰ Okay, I'll remind you again closer to your renewal date.`);
      }

      return NextResponse.json({ ok: true });
    }

    // =========================================================================
    // 2. Handle Text Messages (/start, /help, /status, /privacy, /disconnect)
    // =========================================================================
    const message = update?.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = message?.chat?.id;
    const rawText = message?.text || "";
    const command = rawText.trim().split(" ")[0].toLowerCase();
    const telegramUsername = message?.from?.username || undefined;

    if (!chatId) {
      return NextResponse.json({ ok: true });
    }

    let user: any = null;
    let browserLinked = false;

    // Check if this is an account-pairing /start login_<token>
    if (command === "/start" || rawText.startsWith("/start")) {
      const startPayload = rawText.slice("/start".length).trim();
      const linkMatch = /^login_([A-Za-z0-9_-]{43})$/.exec(startPayload);

      if (linkMatch) {
        const { data: loginLink } = await supabase
          .from("telegram_login_links")
          .select("user_id")
          .eq("link_token", linkMatch[1])
          .is("telegram_chat_id", null)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();

        if (loginLink?.user_id) {
          const canonicalUserId = loginLink.user_id;

          // Check if an orphan record exists for this chatId
          const { data: orphanUser } = await supabase
            .from("users")
            .select("id")
            .eq("telegram_chat_id", chatId)
            .maybeSingle();

          if (orphanUser && orphanUser.id !== canonicalUserId) {
            await mergeOrphanTelegramUser(orphanUser.id, canonicalUserId);
          }

          // Link Telegram chatId to canonical user
          await safeUpdateUser(canonicalUserId, {
            telegram_chat_id: chatId,
            telegram_username: telegramUsername,
            updated_at: new Date().toISOString(),
          });

          await supabase
            .from("telegram_login_links")
            .update({
              telegram_chat_id: chatId,
              connected_at: new Date().toISOString(),
            })
            .eq("link_token", linkMatch[1]);

          browserLinked = true;

          // Load canonical user as active user
          const { data: canonicalUser } = await supabase
            .from("users")
            .select("*")
            .eq("id", canonicalUserId)
            .single();

          user = canonicalUser;
        }
      }
    }

    // If not resolved via pairing link, look up or create standard Telegram user
    if (!user) {
      user = await getOrCreateTelegramUser(chatId, telegramUsername);
    }

    const alias = user.forwarding_alias || "alias";
    const unsubEmail = `${alias}@${domain}`;

    // COMMAND: /help
    if (command === "/help") {
      await sendTelegramMessage(
        chatId,
        `❓ <b>Unsub Help & Commands</b>\n\n` +
          `Unsub tracks your recurring subscriptions and alerts you 3 days before renewal dates so you never get surprised by recurring charges.\n\n` +
          `<b>Available Modes:</b>\n` +
          `1️⃣ <b>Gmail Mode:</b> Read-only scan of receipts and invoices.\n` +
          `2️⃣ <b>Private Mode:</b> Forward receipt emails to <code>${unsubEmail}</code>.\n\n` +
          `<b>Commands:</b>\n` +
          `• /start — Main menu & onboarding\n` +
          `• /status — Check account & tracking state\n` +
          `• /privacy — Privacy guarantee & policy\n` +
          `• /help — Show this help guide\n` +
          `• /disconnect — Disconnect Gmail`,
        {
          inline_keyboard: [
            [
              { text: "📊 Check Status", callback_data: "check_status" },
              { text: "🛡️ Privacy", callback_data: "privacy_settings" },
            ],
            [
              user.gmail_connected
                ? { text: "📬 Scan Inbox", callback_data: "scan_inbox" }
                : { text: "🔗 Connect Gmail", callback_data: "connect_gmail" },
              { text: "📧 Forwarding Guide", callback_data: "how_to_forward" },
            ],
          ],
        },
      );
      return NextResponse.json({ ok: true });
    }

    // COMMAND: /status
    if (command === "/status") {
      const modeLabel = user.gmail_connected
        ? `🟢 Gmail Connected (<code>${user.gmail_email}</code>)`
        : `🔒 Private Forwarding`;

      const lastScan = user.gmail_last_scan_at
        ? new Date(user.gmail_last_scan_at).toLocaleString("en-IN")
        : "None";

      await sendTelegramMessage(
        chatId,
        `📊 <b>Your Unsub Account Status</b>\n\n` +
          `• Chat ID: <code>${chatId}</code>\n` +
          `• Tracking Mode: ${modeLabel}\n` +
          `• Personal Address: <code>${unsubEmail}</code>\n` +
          `• Last Scan: ${lastScan}\n` +
          `• Plan: <b>${(user.plan || "free").toUpperCase()}</b>\n`,
        {
          inline_keyboard: [
            user.gmail_connected
              ? [{ text: "📬 Scan Inbox", callback_data: "scan_inbox" }]
              : [{ text: "🔗 Connect Gmail", callback_data: "connect_gmail" }],
            [{ text: "❓ Help", callback_data: "help_menu" }],
          ],
        },
      );
      return NextResponse.json({ ok: true });
    }

    // COMMAND: /privacy
    if (command === "/privacy") {
      await sendTelegramMessage(
        chatId,
        `🛡️ <b>Unsub Privacy Guarantee</b>\n\n` +
          `• We request <b>minimum read-only access</b> strictly to search for receipts and invoices.\n` +
          `• We <b>never</b> sell user data, train general AI models on your emails, or share data for advertising.\n` +
          `• Google OAuth refresh tokens are encrypted at rest with <b>AES-256-GCM</b>.\n` +
          `• You can disconnect Gmail at any time to permanently revoke access and purge credentials.\n\n` +
          `Read our full Privacy Policy at:\nhttps://api-tracker-dun.vercel.app/privacy`,
        {
          inline_keyboard: [
            [{ text: "❓ Help", callback_data: "help_menu" }],
          ],
        },
      );
      return NextResponse.json({ ok: true });
    }

    // COMMAND: /disconnect
    if (command === "/disconnect") {
      if (!user.gmail_connected) {
        await sendTelegramMessage(
          chatId,
          `🔒 <b>Gmail is not connected.</b>\n\nYou are already using Private Forwarding mode. Receipts forwarded to <code>${unsubEmail}</code> will be processed privately.`,
        );
        return NextResponse.json({ ok: true });
      }

      await sendTelegramMessage(
        chatId,
        `⚠️ <b>Disconnect Gmail</b>\n\nAre you sure you want to disconnect Gmail (<code>${user.gmail_email}</code>)? This will revoke permissions with Google and purge your stored credentials.`,
        {
          inline_keyboard: [
            [{ text: "❌ Confirm Disconnect", callback_data: "confirm_switch_private" }],
            [{ text: "Keep Connected", callback_data: "keep_gmail_connected" }],
          ],
        },
      );
      return NextResponse.json({ ok: true });
    }

    // COMMAND: /start
    if (command === "/start" || rawText.startsWith("/start")) {
      if (user?.gmail_connected && user?.gmail_email) {
        await sendTelegramMessage(
          chatId,
          `Welcome back to Unsub! 👋\n\n` +
            (browserLinked
              ? `✅ <b>Telegram connected to your Unsub web session!</b>\n\n`
              : "") +
            `🟢 <b>Gmail Connected:</b> <code>${user.gmail_email}</code>\n` +
            `📧 <b>Personal Unsub Address:</b> <code>${unsubEmail}</code>\n\n` +
            `Choose how you want to manage your subscriptions:`,
          {
            inline_keyboard: [
              [
                { text: "📬 Scan Inbox", callback_data: "scan_inbox" },
                { text: "⚙️ Gmail Settings", callback_data: "gmail_settings" },
              ],
              [
                {
                  text: "❌ Disconnect Gmail",
                  callback_data: "disconnect_gmail",
                },
                { text: "❓ Help", callback_data: "help_menu" },
              ],
            ],
          },
        );
      } else {
        await sendTelegramMessage(
          chatId,
          `👋 <b>Welcome to Unsub!</b>\n\n` +
            (browserLinked
              ? `✅ <b>Telegram connected to your Unsub web session!</b>\n\n`
              : "") +
            `🆔 <b>Telegram Chat ID:</b> <code>${chatId}</code>\n\n` +
            `📧 <b>Your personal Unsub address:</b>\n<code>${unsubEmail}</code>\n\n` +
            `Choose how you want Unsub to track your subscriptions:`,
          {
            inline_keyboard: [
              [{ text: "🔗 Connect Gmail", callback_data: "connect_gmail" }],
              [
                {
                  text: "🔒 Keep Inbox Private",
                  callback_data: "keep_inbox_private",
                },
              ],
              [{ text: "❓ Help", callback_data: "help_menu" }],
            ],
          },
        );
      }

      return NextResponse.json({ ok: true, alias, unsubEmail });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
