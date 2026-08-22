import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

async function disableButtons(chatId: number, messageId: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(
      `https://api.telegram.org/bot${token}/editMessageReplyMarkup`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] },
        }),
      },
    );
  } catch (err) {
    console.error("Disable buttons error:", err);
  }
}

export async function POST(request: Request) {
  try {
    const update = await request.json();
    console.log("Telegram update:", JSON.stringify(update));

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error("TELEGRAM_BOT_TOKEN is missing");
      return NextResponse.json({ ok: false, error: "Telegram token missing" }, { status: 500 });
    }

    const domain = process.env.UNSUB_EMAIL_DOMAIN || "unsub.app";

    // 1. Handle Inline Keyboard Button Clicks
    if (update?.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;
      const [action, subscriptionId] = callbackQuery.data.split(":");

      // Acknowledge callback query
      await fetch(
        `https://api.telegram.org/bot${token}/answerCallbackQuery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: callbackQuery.id }),
        },
      );

      // Disable reply buttons
      await disableButtons(chatId, messageId);

      // Look up user
      const { data: telegramUser } = await supabase
        .from("users")
        .select("id, forwarding_alias")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      const userId = telegramUser?.id;
      const alias = telegramUser?.forwarding_alias || "alias";
      const unsubUserEmail = `${alias}@${domain}`;

      if (action === "still_using" && userId && subscriptionId) {
        const { data: subscription } = await supabase
          .from("subscriptions")
          .select("id, user_id")
          .eq("id", subscriptionId)
          .eq("user_id", userId)
          .single();

        if (subscription) {
          await supabase.from("usage_reports").insert({
            subscription_id: subscription.id,
            user_id: subscription.user_id,
            source: "self_report",
            used: true,
          });

          await supabase
            .from("subscriptions")
            .update({ last_nudged_at: null })
            .eq("id", subscription.id);
        }

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `✅ Great!\n\nWe'll keep tracking this subscription.`,
          }),
        });
      }

      if (action === "mark_cancelled" && userId && subscriptionId) {
        await supabase
          .from("subscriptions")
          .update({ status: "cancelled" })
          .eq("id", subscriptionId)
          .eq("user_id", userId);

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🗑️ Subscription removed from tracking.\n\nUnsub will stop reminding you about this subscription.`,
          }),
        });
      }

      if (action === "remind_later") {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `⏰ Okay, I'll remind you later.`,
          }),
        });
      }

      if (action === "connect_gmail") {
        await supabase
          .from("users")
          .update({ tracking_method: "gmail" })
          .eq("telegram_chat_id", chatId);

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text:
              `🔗 Gmail Setup Selected!\n\n` +
              `To automatically forward subscription receipts from Gmail:\n\n` +
              `1️⃣ Open Gmail Settings ➔ Forwarding and POP/IMAP\n` +
              `2️⃣ Add forwarding address: \`${unsubUserEmail}\`\n` +
              `3️⃣ Create a filter for keywords: 'receipt', 'invoice', or 'subscription'\n\n` +
              `Forwarded receipts will automatically appear on your Unsub dashboard!`,
            parse_mode: "Markdown",
          }),
        });
      }

      if (action === "private_forwarding") {
        await supabase
          .from("users")
          .update({ tracking_method: "forwarding" })
          .eq("telegram_chat_id", chatId);

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text:
              `🔒 Private Forwarding Selected!\n\n` +
              `Your inbox remains 100% private. Simply forward any subscription receipt email (from Netflix, Spotify, ChatGPT, Canva, etc.) to your personal Unsub address:\n\n` +
              `📧 \`${unsubUserEmail}\`\n\n` +
              `Our AI will parse the details and ping you here on Telegram 3 days before every renewal date!`,
            parse_mode: "Markdown",
          }),
        });
      }

      return NextResponse.json({ ok: true });
    }

    // 2. Handle Text Messages (/start)
    const message = update?.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = message?.chat?.id;
    const text = message?.text;

    if (!chatId || !text?.startsWith("/start")) {
      return NextResponse.json({ ok: true });
    }

    const startPayload = text.slice("/start".length).trim();
    const linkMatch = /^login_([A-Za-z0-9_-]{43})$/.exec(startPayload);
    let alias: string = "";
    let browserLinked = false;
    let isAlreadyConnectedUser = false;

    if (linkMatch) {
      // Deep link pairing from browser dashboard
      const { data: loginLink } = await supabase
        .from("telegram_login_links")
        .select("user_id")
        .eq("link_token", linkMatch[1])
        .is("telegram_chat_id", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (loginLink?.user_id) {
        const { data: linkedUser } = await supabase
          .from("users")
          .select("id, forwarding_alias")
          .eq("id", loginLink.user_id)
          .maybeSingle();

        if (linkedUser) {
          // Associate telegram_chat_id to public user
          await supabase
            .from("users")
            .update({ telegram_chat_id: chatId })
            .eq("id", linkedUser.id);

          await supabase
            .from("telegram_login_links")
            .update({
              telegram_chat_id: chatId,
              connected_at: new Date().toISOString(),
            })
            .eq("link_token", linkMatch[1]);

          alias = linkedUser.forwarding_alias;
          browserLinked = true;
        }
      }
    }

    if (!alias) {
      // Direct bot start
      const { data: existingUser } = await supabase
        .from("users")
        .select("id, forwarding_alias")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      if (existingUser) {
        alias = existingUser.forwarding_alias;
        isAlreadyConnectedUser = true;
      } else {
        alias = await generateUniqueAlias();
        await supabase
          .from("users")
          .insert({ telegram_chat_id: chatId, forwarding_alias: alias });
      }
    }

    const unsubEmail = `${alias}@${domain}`;
    let messageText: string;
    let replyMarkup: any = undefined;

    if (isAlreadyConnectedUser && !browserLinked) {
      // Already connected user sending /start again -> don't show onboarding buttons
      messageText =
        `Welcome back to Unsub! 👋\n\n` +
        `Your Telegram chat is connected to your Unsub account.\n\n` +
        `📧 Your Unsub forwarding address is:\n\`${unsubEmail}\`\n\n` +
        `Forward any subscription receipt emails to this address or manage your tracked subscriptions on your dashboard.`;
    } else {
      // New user or newly linked browser user -> show onboarding buttons
      messageText =
        `👋 Welcome to Unsub!\n\n` +
        (browserLinked
          ? `✅ This Telegram chat is connected to your Unsub sign-in. Return to your browser to continue.\n\n`
          : "") +
        `📧 Your personal Unsub address:\n\`${unsubEmail}\`\n\n` +
        `Choose how you want Unsub to track your subscriptions:`;

      replyMarkup = {
        inline_keyboard: [
          [
            {
              text: "🔗 Connect Gmail",
              callback_data: "connect_gmail",
            },
          ],
          [
            {
              text: "🔒 Keep Inbox Private",
              callback_data: "private_forwarding",
            },
          ],
        ],
      };
    }

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: "Markdown",
        reply_markup: replyMarkup,
      }),
    });

    return NextResponse.json({ ok: true, alias, unsubEmail });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
