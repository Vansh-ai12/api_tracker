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

async function getOrCreateTelegramUser(chatId: number, username?: string) {
  const { data: basicUser } = await supabase
    .from("users")
    .select("id, forwarding_alias, telegram_chat_id, plan")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  let user = basicUser;

  if (!user) {
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
    user = newUser || {
      id: "temp",
      forwarding_alias: alias,
      telegram_chat_id: chatId,
      plan: "free",
    };
  }

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

    // 1. Handle Inline Keyboard Button Clicks (Callback Queries)
    if (update?.callback_query) {
      const callbackQuery = update.callback_query;

      console.log(
        "[telegram-webhook] CALLBACK QUERY RECEIVED:",
        JSON.stringify(callbackQuery, null, 2),
      );

      const chatId =
        callbackQuery?.message?.chat?.id ?? callbackQuery?.from?.id;

      const messageId = callbackQuery?.message?.message_id;
      const callbackData = callbackQuery?.data;

      if (!chatId || !callbackData) {
        console.error(
          "[telegram-webhook] Invalid callback query:",
          JSON.stringify(callbackQuery, null, 2),
        );

        return NextResponse.json({ ok: true });
      }

      const [action, subscriptionId] = callbackData.split(":");

      console.log(
        `[telegram-webhook] action=${action}, subscriptionId=${subscriptionId ?? "none"}, chatId=${chatId}`,
      );

      const callbackResponse = await fetch(
        `https://api.telegram.org/bot${token}/answerCallbackQuery`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            callback_query_id: callbackQuery.id,
            text: `Processing ${action.replaceAll("_", " ")}...`,
            show_alert: false,
          }),
        },
      );

      if (!callbackResponse.ok) {
        console.error(
          "[telegram-webhook] answerCallbackQuery failed:",
          await callbackResponse.text(),
        );
      }

      // Safely look up or auto-create user record
      const user = await getOrCreateTelegramUser(
        chatId,
        callbackQuery.from?.username,
      );
      const alias = user.forwarding_alias || "alias";
      const unsubEmail = `${alias}@${domain}`;

      // ACTION 1: CONNECT GMAIL (Initiate Real OAuth Authorization Flow)
      if (action === "connect_gmail") {
        if (user.gmail_connected && user.gmail_email) {
          await sendTelegramMessage(
            chatId,
            `✅ <b>Gmail is already connected!</b>\n\n` +
              `Gmail account:\n<code>${user.gmail_email}</code>\n\n` +
              `Unsub is active and analyzing your inbox. What would you like to do?`,
            {
              inline_keyboard: [
                [
                  { text: "📬 Scan Inbox", callback_data: "scan_inbox" },
                  {
                    text: "⚙️ Gmail Settings",
                    callback_data: "gmail_settings",
                  },
                ],
                [
                  {
                    text: "❌ Disconnect Gmail",
                    callback_data: "disconnect_gmail",
                  },
                ],
              ],
            },
          );
          return NextResponse.json({ ok: true });
        }

        // Generate a 15-minute one-time OAuth state token
        const stateToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        // Make sure Gmail OAuth configuration exists before starting the flow.
        const missingGoogleEnv = [
          "GOOGLE_CLIENT_ID",
          "GOOGLE_CLIENT_SECRET",
          "GOOGLE_REDIRECT_URI",
        ].filter((key) => !process.env[key]);

        if (missingGoogleEnv.length > 0) {
          console.error(
            "[gmail-oauth] Missing required environment variables:",
            missingGoogleEnv,
          );

          await sendTelegramMessage(
            chatId,
            `⚠️ <b>Gmail connection is temporarily unavailable.</b>\n\n` +
              `The Gmail integration is not fully configured on the server yet.\n\n` +
              `Please try again later.`,
          );

          return NextResponse.json({
            ok: false,
            error: "Gmail OAuth configuration missing",
          });
        }

        // Store OAuth state before sending the user to Google.
        const { error: stateInsertErr } = await supabase
          .from("gmail_oauth_states")
          .insert({
            state: stateToken,
            telegram_chat_id: chatId,
            user_id: user.id,
            expires_at: expiresAt,
          });

        if (stateInsertErr) {
          console.error(
            "[gmail_oauth_states] Failed to store OAuth state:",
            stateInsertErr,
          );

          await sendTelegramMessage(
            chatId,
            `⚠️ <b>Could not start Gmail connection.</b>\n\n` +
              `Please try again in a moment.`,
          );

          return NextResponse.json({
            ok: false,
            error: "Failed to create OAuth state",
          });
        }

        logAuditEvent("gmail_oauth_started", {
          userId: user.id,
          telegramChatId: chatId,
        });

        const googleOAuthUrl = generateGoogleAuthUrl(stateToken);

        await sendTelegramMessage(
          chatId,
          `🔗 <b>Connect your Gmail account securely</b>\n\n` +
            `Click the button below to open Google's secure authorization page. Unsub requests <b>minimum read-only access</b> to identify subscription and receipt emails.`,
          {
            inline_keyboard: [
              [
                {
                  text: "🔗 Connect your Gmail",
                  url: googleOAuthUrl,
                },
              ],
            ],
          },
        );
      }

      // ACTION 2: KEEP INBOX PRIVATE (Private Forwarding Mode)
      if (action === "keep_inbox_private" || action === "private_forwarding") {
        if (user.gmail_connected) {
          await sendTelegramMessage(
            chatId,
            `⚠️ <b>Gmail is currently connected</b>\n\n` +
              `Switching to Private Inbox mode will stop Gmail access and disconnect your connected account (<code>${user.gmail_email}</code>).\n\n` +
              `Do you want to disconnect Gmail now?`,
            {
              inline_keyboard: [
                [
                  {
                    text: "Disconnect Gmail & Use Private Inbox",
                    callback_data: "confirm_switch_private",
                  },
                ],
                [
                  {
                    text: "Keep Gmail Connected",
                    callback_data: "keep_gmail_connected",
                  },
                ],
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
          `🔒 <b>Inbox privacy mode enabled.</b>\n\n` +
            `Unsub will <b>not</b> access your Gmail inbox.\n\n` +
            `Instead, forward subscription & receipt emails to your personal Unsub address:\n\n` +
            `📧 <code>${unsubEmail}</code>\n\n` +
            `Our AI will automatically parse the receipt details and ping you 3 days before renewal dates!`,
          {
            inline_keyboard: [
              [
                {
                  text: "📧 How to Forward Emails",
                  callback_data: "how_to_forward",
                },
              ],
              [
                {
                  text: "🔗 My Unsub Address",
                  callback_data: "my_unsub_address",
                },
                {
                  text: "⚙️ Privacy Settings",
                  callback_data: "privacy_settings",
                },
              ],
            ],
          },
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

        logAuditEvent("gmail_disconnected", {
          userId: user.id,
          telegramChatId: chatId,
        });

        await sendTelegramMessage(
          chatId,
          `🔒 <b>Gmail Disconnected & Private Inbox Enabled</b>\n\n` +
            `Your Gmail credentials have been completely erased. Unsub no longer has access to your Gmail.\n\n` +
            `Forward your receipts to: <code>${unsubEmail}</code>`,
          {
            inline_keyboard: [
              [
                {
                  text: "📧 How to Forward Emails",
                  callback_data: "how_to_forward",
                },
              ],
              [
                {
                  text: "🔗 My Unsub Address",
                  callback_data: "my_unsub_address",
                },
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

        logAuditEvent("gmail_disconnected", {
          userId: user.id,
          telegramChatId: chatId,
        });

        await sendTelegramMessage(
          chatId,
          `❌ <b>Gmail disconnected successfully.</b>\n\n` +
            `Unsub has revoked access and deleted your stored credentials. Tracking mode set to Private Inbox.\n\n` +
            `Forward receipts to: <code>${unsubEmail}</code>`,
        );
      }

      // ACTION 4: SCAN INBOX (Asynchronous Controlled Scan)
      if (action === "scan_inbox") {
        if (!user.gmail_connected) {
          await sendTelegramMessage(
            chatId,
            "⚠️ Please connect your Gmail account first.",
          );
          return NextResponse.json({ ok: true });
        }

        if (user.gmail_last_scan_status === "scanning") {
          await sendTelegramMessage(
            chatId,
            "⏳ A scan is already in progress. Please wait a moment.",
          );
          return NextResponse.json({ ok: true });
        }

        await sendTelegramMessage(
          chatId,
          "🔍 <b>Starting controlled inbox scan...</b>\n\nAnalyzing recent subscription & receipt emails.",
        );

        (async () => {
          try {
            const res = await runGmailInboxScan(user.id);
            if (res.error) {
              await sendTelegramMessage(
                chatId,
                `⚠️ Inbox scan issue: ${res.error}`,
              );
            } else {
              await sendTelegramMessage(
                chatId,
                `✅ <b>Inbox scan complete!</b>\n\n` +
                  `• Candidate emails scanned: ${res.scannedCount}\n` +
                  `• New subscriptions tracked: ${res.newSubscriptionsCount}\n` +
                  `• Subscriptions updated: ${res.updatedSubscriptionsCount}\n\n` +
                  `View updated subscriptions on your dashboard!`,
                {
                  inline_keyboard: [
                    [
                      { text: "📬 Scan Inbox", callback_data: "scan_inbox" },
                      {
                        text: "⚙️ Gmail Settings",
                        callback_data: "gmail_settings",
                      },
                    ],
                  ],
                },
              );
            }
          } catch (err: any) {
            console.error("Async scan error:", err);
            await sendTelegramMessage(
              chatId,
              "❌ Failed to scan inbox. Please try again later.",
            );
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
          `⚙️ <b>Gmail Connection Details</b>\n\n` +
            `• Connected Account: <code>${user.gmail_email || "Unknown"}</code>\n` +
            `• Status: 🟢 Active (Read-Only)\n` +
            `• Last Inbox Scan: ${lastScan}\n`,
          {
            inline_keyboard: [
              [
                { text: "📬 Scan Inbox", callback_data: "scan_inbox" },
                {
                  text: "❌ Disconnect Gmail",
                  callback_data: "disconnect_gmail",
                },
              ],
            ],
          },
        );
      }

      // ACTION 6: HELPERS
      if (action === "how_to_forward") {
        await sendTelegramMessage(
          chatId,
          `📖 <b>How to Forward Receipts to Unsub</b>\n\n` +
            `1️⃣ Open any receipt email (Netflix, Spotify, ChatGPT, Canva, etc.)\n` +
            `2️⃣ Click <b>Forward</b>\n` +
            `3️⃣ Send to: <code>${unsubEmail}</code>\n\n` +
            `💡 <i>Pro-tip:</i> Set up an automated auto-forwarding filter in Gmail/Outlook for emails matching 'receipt' or 'invoice'!`,
        );
      }

      if (action === "my_unsub_address") {
        await sendTelegramMessage(
          chatId,
          `📧 <b>Your Personal Unsub Forwarding Address</b>\n\n` +
            `<code>${unsubEmail}</code>\n\n` +
            `Tap the text above to copy your unique address!`,
          {
            inline_keyboard: [
              [
                {
                  text: "📧 How to Forward Emails",
                  callback_data: "how_to_forward",
                },
              ],
            ],
          },
        );
      }

      if (action === "privacy_settings") {
        await sendTelegramMessage(
          chatId,
          `🛡️ <b>Unsub Privacy Guarantee</b>\n\n` +
            `• We request <b>minimum read-only access</b> for Gmail mode.\n` +
            `• We <b>never</b> read personal emails, store full message bodies, or expose credentials.\n` +
            `• You can disconnect Gmail at any time to purge credentials.\n` +
            `• Private Inbox mode uses zero Google permissions.`,
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
          `✅ Great!\n\nWe'll keep tracking this subscription.`,
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
          `🗑️ Subscription removed from tracking.`,
        );
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
      const { data: loginLink } = await supabase
        .from("telegram_login_links")
        .select("user_id")
        .eq("link_token", linkMatch[1])
        .is("telegram_chat_id", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (loginLink?.user_id) {
        await safeUpdateUser(loginLink.user_id, {
          telegram_chat_id: chatId,
          telegram_username: telegramUsername,
        });
        await supabase
          .from("telegram_login_links")
          .update({
            telegram_chat_id: chatId,
            connected_at: new Date().toISOString(),
          })
          .eq("link_token", linkMatch[1]);

        browserLinked = true;
      }
    }

    // Get or create user safely
    const user = await getOrCreateTelegramUser(chatId, telegramUsername);
    const alias = user.forwarding_alias || "alias";
    const unsubEmail = `${alias}@${domain}`;

    if (user?.gmail_connected && user?.gmail_email) {
      await sendTelegramMessage(
        chatId,
        `Welcome back to Unsub! 👋\n\n` +
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
            ],
          ],
        },
      );
    } else {
      await sendTelegramMessage(
        chatId,
        `👋 <b>Welcome to Unsub!</b>\n\n` +
          (browserLinked
            ? `✅ Telegram chat connected to your Unsub web session.\n\n`
            : "") +
          `🆔 <b>Telegram Chat ID:</b> <code>${chatId}</code>\n\n` +
          `📧 Your personal Unsub address:\n<code>${unsubEmail}</code>\n\n` +
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
          ],
        },
      );
    }

    return NextResponse.json({ ok: true, alias, unsubEmail });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
