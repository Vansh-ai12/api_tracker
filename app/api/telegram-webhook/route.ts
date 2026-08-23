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
  }
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
 * Safely looks up or auto-creates a user record by Telegram chat ID.
 * Resilient against missing schema columns.
 */
async function getOrCreateTelegramUser(chatId: number, username?: string) {
  // 1. Query guaranteed basic columns first
  const { data: basicUser } = await supabase
    .from("users")
    .select("id, forwarding_alias, telegram_chat_id, plan")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  let user = basicUser;

  if (!user) {
    // Auto-create user if not found
    const alias = await generateUniqueAlias();
    const { data: newUser, error: insertErr } = await supabase
      .from("users")
      .insert({
        telegram_chat_id: chatId,
        forwarding_alias: alias,
      })
      .select("id, forwarding_alias, telegram_chat_id, plan")
      .maybeSingle();

    if (insertErr) {
      console.error("[telegram-webhook] User insert error:", insertErr);
    }
    user = newUser || { id: "temp", forwarding_alias: alias, telegram_chat_id: chatId, plan: "free" };
  }

  // 2. Fetch full extended columns if present
  const { data: extendedData } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return {
    ...user,
    ...(extendedData || {}),
  };
}

/**
 * Safely updates user record, falling back gracefully if optional columns are absent.
 */
async function safeUpdateUser(userId: string, payload: Record<string, any>) {
  const { error } = await supabase.from("users").update(payload).eq("id", userId);
  if (error) {
    console.warn("[telegram-webhook] Extended update warning:", error.message);
    const fallbackPayload: Record<string, any> = {};
    if (payload.tracking_mode) {
      fallbackPayload.tracking_method = payload.tracking_mode === "GMAIL" ? "gmail" : "forwarding";
    }
    await supabase.from("users").update(fallbackPayload).eq("id", userId);
  }
}

async function disableButtons(chatId: number, messageId: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] },
      }),
    });
  } catch (err) {
    console.error("Disable buttons error:", err);
  }
}

async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      reply_markup: replyMarkup,
    }),
  });
}

export async function POST(request: Request) {
  try {
    const update = await request.json();
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error("TELEGRAM_BOT_TOKEN is missing");
      return NextResponse.json({ ok: false, error: "Telegram token missing" }, { status: 500 });
    }

    const domain = process.env.UNSUB_EMAIL_DOMAIN || "unsub.app";

    // 1. Handle Inline Keyboard Button Clicks (Callback Queries)
    if (update?.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;
      const callbackData = callbackQuery.data;
      const [action, subscriptionId] = callbackData.split(":");

      // Always acknowledge callback query immediately
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackQuery.id }),
      });

      // Disable buttons on previous message except when starting long actions
      if (action !== "scan_inbox") {
        await disableButtons(chatId, messageId);
      }

      // Safely look up or auto-create user record
      const user = await getOrCreateTelegramUser(chatId, callbackQuery.from?.username);
      const alias = user.forwarding_alias || "alias";
      const unsubEmail = `${alias}@${domain}`;

      // ACTION 1: CONNECT GMAIL (Initiate Real OAuth Authorization Flow)
      if (action === "connect_gmail") {
        if (user.gmail_connected && user.gmail_email) {
          await sendTelegramMessage(
            chatId,
            `✅ *Gmail is already connected\\!*\n\n` +
            `Gmail account:\n\`${user.gmail_email}\`\n\n` +
            `Unsub is active and analyzing your inbox\\. What would you like to do?`,
            {
              inline_keyboard: [
                [
                  { text: "📬 Scan Inbox", callback_data: "scan_inbox" },
                  { text: "⚙️ Gmail Settings", callback_data: "gmail_settings" },
                ],
                [{ text: "❌ Disconnect Gmail", callback_data: "disconnect_gmail" }],
              ],
            }
          );
          return NextResponse.json({ ok: true });
        }

        // Generate a 15-minute one-time OAuth state token
        const stateToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        const { error: stateInsertErr } = await supabase.from("gmail_oauth_states").insert({
          state: stateToken,
          telegram_chat_id: chatId,
          user_id: user.id,
          expires_at: expiresAt,
        });

        if (stateInsertErr) {
          console.warn("[gmail_oauth_states] Insert warning:", stateInsertErr);
        }

        logAuditEvent("gmail_oauth_started", { userId: user.id, telegramChatId: chatId });

        const googleOAuthUrl = generateGoogleAuthUrl(stateToken);

        await sendTelegramMessage(
          chatId,
          `🔗 *Connect your Gmail account securely*\n\n` +
          `Click the button below to open Google's secure authorization page\\. Unsub requests *minimum read\\-only* access to identify subscription and receipt emails\\.`,
          {
            inline_keyboard: [
              [
                {
                  text: "🔗 Connect your Gmail",
                  url: googleOAuthUrl,
                },
              ],
            ],
          }
        );
      }

      // ACTION 2: KEEP INBOX PRIVATE (Private Forwarding Mode)
      if (action === "keep_inbox_private" || action === "private_forwarding") {
        if (user.gmail_connected) {
          // If Gmail is already connected, ask explicit confirmation to disconnect first
          await sendTelegramMessage(
            chatId,
            `⚠️ *Gmail is currently connected*\n\n` +
            `Switching to Private Inbox mode will stop Gmail access and disconnect your connected account (\`${user.gmail_email}\`)\\.\n\n` +
            `Do you want to disconnect Gmail now?`,
            {
              inline_keyboard: [
                [{ text: "Disconnect Gmail & Use Private Inbox", callback_data: "confirm_switch_private" }],
                [{ text: "Keep Gmail Connected", callback_data: "keep_gmail_connected" }],
              ],
            }
          );
          return NextResponse.json({ ok: true });
        }

        // Set tracking_mode to PRIVATE_EMAIL safely
        await safeUpdateUser(user.id, { tracking_mode: "PRIVATE_EMAIL", updated_at: new Date().toISOString() });

        logAuditEvent("private_mode_enabled", { userId: user.id, telegramChatId: chatId });

        await sendTelegramMessage(
          chatId,
          `🔒 *Inbox privacy mode enabled.*\n\n` +
          `Unsub will *not* access your Gmail inbox.\n\n` +
          `Instead, forward subscription & receipt emails to your personal Unsub address:\n\n` +
          `📧 \`${unsubEmail}\`\n\n` +
          `Our AI will automatically parse the receipt details and ping you 3 days before renewal dates!`,
          {
            inline_keyboard: [
              [{ text: "📧 How to Forward Emails", callback_data: "how_to_forward" }],
              [
                { text: "🔗 My Unsub Address", callback_data: "my_unsub_address" },
                { text: "⚙️ Privacy Settings", callback_data: "privacy_settings" },
              ],
            ],
          }
        );
      }

      // ACTION: CONFIRM SWITCH TO PRIVATE (Disconnects Gmail & Switches Mode)
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

        logAuditEvent("gmail_disconnected", { userId: user.id, telegramChatId: chatId });

        await sendTelegramMessage(
          chatId,
          `🔒 *Gmail Disconnected & Private Inbox Enabled*\n\n` +
          `Your Gmail credentials have been completely erased. Unsub no longer has access to your Gmail.\n\n` +
          `Forward your receipts to: \`${unsubEmail}\``,
          {
            inline_keyboard: [
              [{ text: "📧 How to Forward Emails", callback_data: "how_to_forward" }],
              [{ text: "🔗 My Unsub Address", callback_data: "my_unsub_address" }],
            ],
          }
        );
      }

      if (action === "keep_gmail_connected") {
        await sendTelegramMessage(
          chatId,
          `🟢 *Gmail stays connected\\!*\n\nYour Gmail integration remains active\\.`,
          {
            inline_keyboard: [
              [
                { text: "📬 Scan Inbox", callback_data: "scan_inbox" },
                { text: "⚙️ Gmail Settings", callback_data: "gmail_settings" },
              ],
            ],
          }
        );
      }

      // ACTION 3: DISCONNECT GMAIL
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

        logAuditEvent("gmail_disconnected", { userId: user.id, telegramChatId: chatId });

        await sendTelegramMessage(
          chatId,
          `❌ *Gmail disconnected successfully.*\n\n` +
          `Unsub has revoked access and deleted your stored credentials. Tracking mode set to Private Inbox.\n\n` +
          `Forward receipts to: \`${unsubEmail}\``
        );
      }

      // ACTION 4: SCAN INBOX (Asynchronous Controlled Scan)
      if (action === "scan_inbox") {
        if (!user.gmail_connected) {
          await sendTelegramMessage(chatId, "⚠️ Please connect your Gmail account first.");
          return NextResponse.json({ ok: true });
        }

        if (user.gmail_last_scan_status === "scanning") {
          await sendTelegramMessage(chatId, "⏳ A scan is already in progress. Please wait a moment.");
          return NextResponse.json({ ok: true });
        }

        await sendTelegramMessage(chatId, "🔍 *Starting controlled inbox scan...*\n\nAnalyzing recent subscription & receipt emails.");

        // Execute scan asynchronously
        (async () => {
          try {
            const res = await runGmailInboxScan(user.id);
            if (res.error) {
              await sendTelegramMessage(chatId, `⚠️ Inbox scan issue: ${res.error}`);
            } else {
              await sendTelegramMessage(
                chatId,
                `✅ *Inbox scan complete!*\n\n` +
                `• Candidate emails scanned: ${res.scannedCount}\n` +
                `• New subscriptions tracked: ${res.newSubscriptionsCount}\n` +
                `• Subscriptions updated: ${res.updatedSubscriptionsCount}\n\n` +
                `View updated subscriptions on your dashboard!`,
                {
                  inline_keyboard: [
                    [
                      { text: "📬 Scan Inbox", callback_data: "scan_inbox" },
                      { text: "⚙️ Gmail Settings", callback_data: "gmail_settings" },
                    ],
                  ],
                }
              );
            }
          } catch (err: any) {
            console.error("Async scan error:", err);
            await sendTelegramMessage(chatId, "❌ Failed to scan inbox. Please try again later.");
          }
        })();
      }

      // ACTION 5: GMAIL SETTINGS
      if (action === "gmail_settings") {
        const lastScan = user.gmail_last_scan_at
          ? new Date(user.gmail_last_scan_at).toLocaleString("en-IN")
          : "Never";

        await sendTelegramMessage(
          chatId,
          `⚙️ *Gmail Connection Details*\n\n` +
          `• Connected Account: \`${user.gmail_email || "Unknown"}\`\n` +
          `• Status: 🟢 Active (Read-Only)\n` +
          `• Last Inbox Scan: ${lastScan}\n`,
          {
            inline_keyboard: [
              [
                { text: "📬 Scan Inbox", callback_data: "scan_inbox" },
                { text: "❌ Disconnect Gmail", callback_data: "disconnect_gmail" },
              ],
            ],
          }
        );
      }

      // ACTION 6: HELPERS (How to forward, My Unsub address, Privacy settings)
      if (action === "how_to_forward") {
        await sendTelegramMessage(
          chatId,
          `📖 *How to Forward Receipts to Unsub*\n\n` +
          `1️⃣ Open any receipt email (Netflix, Spotify, ChatGPT, Canva, etc.)\n` +
          `2️⃣ Click **Forward**\n` +
          `3️⃣ Send to: \`${unsubEmail}\`\n\n` +
          `💡 *Pro-tip:* Set up an automated auto-forwarding filter in Gmail/Outlook for emails matching 'receipt' or 'invoice'!`
        );
      }

      if (action === "my_unsub_address") {
        await sendTelegramMessage(
          chatId,
          `📧 *Your Personal Unsub Forwarding Address*\n\n` +
          `\`${unsubEmail}\`\n\n` +
          `Tap the text above to copy your unique address!`,
          {
            inline_keyboard: [[{ text: "📧 How to Forward Emails", callback_data: "how_to_forward" }]],
          }
        );
      }

      if (action === "privacy_settings") {
        await sendTelegramMessage(
          chatId,
          `🛡️ *Unsub Privacy Guarantee*\n\n` +
          `• We request *minimum read-only access* for Gmail mode.\n` +
          `• We *never* read personal emails, store full message bodies, or expose credentials.\n` +
          `• You can disconnect Gmail at any time to purge credentials.\n` +
          `• Private Inbox mode uses zero Google permissions.`
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
        await sendTelegramMessage(chatId, `✅ Great!\n\nWe'll keep tracking this subscription.`);
      }

      if (action === "mark_cancelled" && subscriptionId) {
        await supabase
          .from("subscriptions")
          .update({ status: "cancelled" })
          .eq("id", subscriptionId)
          .eq("user_id", user.id);
        await sendTelegramMessage(chatId, `🗑️ Subscription removed from tracking.`);
      }

      if (action === "remind_later") {
        await sendTelegramMessage(chatId, `⏰ Okay, I'll remind you later.`);
      }

      return NextResponse.json({ ok: true });
    }

    // 2. Handle Text Messages (/start)
    const message = update?.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = message?.chat?.id;
    const text = message?.text;
    const telegramUsername = message?.from?.username || undefined;

    if (!chatId || !text?.startsWith("/start")) {
      return NextResponse.json({ ok: true });
    }

    const startPayload = text.slice("/start".length).trim();
    const linkMatch = /^login_([A-Za-z0-9_-]{43})$/.exec(startPayload);
    let browserLinked = false;

    if (linkMatch) {
      // Pairing from web login page
      const { data: loginLink } = await supabase
        .from("telegram_login_links")
        .select("user_id")
        .eq("link_token", linkMatch[1])
        .is("telegram_chat_id", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (loginLink?.user_id) {
        await safeUpdateUser(loginLink.user_id, { telegram_chat_id: chatId, telegram_username: telegramUsername });
        await supabase
          .from("telegram_login_links")
          .update({ telegram_chat_id: chatId, connected_at: new Date().toISOString() })
          .eq("link_token", linkMatch[1]);

        browserLinked = true;
      }
    }

    // Get or create user safely
    const user = await getOrCreateTelegramUser(chatId, telegramUsername);
    const alias = user.forwarding_alias || "alias";
    const unsubEmail = `${alias}@${domain}`;

    if (user?.gmail_connected && user?.gmail_email) {
      // User with connected Gmail
      await sendTelegramMessage(
        chatId,
        `Welcome back to Unsub! 👋\n\n` +
        `🟢 *Gmail Connected:* \`${user.gmail_email}\`\n` +
        `📧 *Personal Unsub Address:* \`${unsubEmail}\`\n\n` +
        `Choose how you want to manage your subscriptions:`,
        {
          inline_keyboard: [
            [
              { text: "📬 Scan Inbox", callback_data: "scan_inbox" },
              { text: "⚙️ Gmail Settings", callback_data: "gmail_settings" },
            ],
            [{ text: "❌ Disconnect Gmail", callback_data: "disconnect_gmail" }],
          ],
        }
      );
    } else {
      // Onboarding welcome message with REAL Inline Keyboard Buttons
      await sendTelegramMessage(
        chatId,
        `👋 Welcome to Unsub!\n\n` +
        (browserLinked ? `✅ Telegram chat connected to your Unsub web session.\n\n` : "") +
        `📧 Your personal Unsub address:\n\`${unsubEmail}\`\n\n` +
        `Choose how you want Unsub to track your subscriptions:`,
        {
          inline_keyboard: [
            [{ text: "🔗 Connect Gmail", callback_data: "connect_gmail" }],
            [{ text: "🔒 Keep Inbox Private", callback_data: "keep_inbox_private" }],
          ],
        }
      );
    }

    return NextResponse.json({ ok: true, alias, unsubEmail });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
