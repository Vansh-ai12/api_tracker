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

    if (error) {
      throw error;
    }

    if (!data) {
      return alias;
    }
  }

  throw new Error("Could not generate a unique alias");
}

async function disableButtons(chatId: number, messageId: number) {
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [],
        },
      }),
    },
  );

  const result = await response.json();

  console.log("Disable buttons result:", result);

  if (!response.ok || !result.ok) {
    throw new Error(
      `Failed to disable Telegram buttons: ${
        result.description || "Unknown Telegram error"
      }`,
    );
  }
}

export async function POST(request: Request) {
  try {
    // Telegram sends the entire update as JSON
    const update = await request.json();

    console.log("Telegram update:", JSON.stringify(update));

    // Handle button clicks
    if (update?.callback_query) {
      const callbackQuery = update.callback_query;

      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;
      const [action, subscriptionId] = callbackQuery.data.split(":");

      // Acknowledge the button click
      await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            callback_query_id: callbackQuery.id,
          }),
        },
      );

      // Disable all buttons immediately
      await disableButtons(chatId, messageId);

      const { data: telegramUser, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_chat_id", chatId)
        .single();

      if (userError) {
        console.error("Telegram user lookup failed:", userError);

        return NextResponse.json({
          ok: false,
          error: "User lookup failed",
        });
      }

      if (!telegramUser) {
        return NextResponse.json({
          ok: false,
          error: "User not found",
        });
      }

      const userId = telegramUser.id;

      if (action === "still_using") {
        if (!subscriptionId) {
          return NextResponse.json({
            ok: false,
            error: "Subscription ID missing",
          });
        }

        const { data: subscription } = await supabase
          .from("subscriptions")
          .select("id,user_id")
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
        }

        await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: `✅ Great!\n\n` + `We'll keep tracking this subscription.`,
            }),
          },
        );
      }
      if (action === "cancel_subscription") {
        if (!subscriptionId) {
          return NextResponse.json({
            ok: false,
            error: "Subscription ID missing",
          });
        }

        const { error: cancelError } = await supabase
          .from("subscriptions")
          .update({
            status: "cancelled",
          })
          .eq("id", subscriptionId)
          .eq("user_id", userId);

        if (cancelError) {
          console.error("Subscription cancellation error:", cancelError);

          return NextResponse.json({
            ok: false,
            error: "Could not cancel subscription",
          });
        }

        await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: `❌ Subscription marked as cancelled.`,
            }),
          },
        );
      }

      if (action === "remind_later") {
        await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: `⏰ Okay, I'll remind you later.`,
            }),
          },
        );
      }

      if (action === "connect_gmail") {
        await supabase
          .from("users")
          .update({
            tracking_method: "gmail",
          })
          .eq("telegram_chat_id", chatId);

        await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: chatId,
              text:
                `🔗 Gmail connection selected.\n\n` +
                `Next, we'll connect your email securely.\n\n` +
                `No subscription emails will need manual forwarding.`,
            }),
          },
        );
      }

      if (action === "private_forwarding") {
        await supabase
          .from("users")
          .update({
            tracking_method: "forwarding",
          })
          .eq("telegram_chat_id", chatId);

        await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: chatId,
              text:
                `🔒 Privacy mode selected.\n\n` +
                `Your Unsub address will receive subscription emails:\n\n` +
                `📧 We'll guide you through the one-time forwarding setup.`,
            }),
          },
        );
      }

      return NextResponse.json({
        ok: true,
      });
    }

    const message = update?.message;

    // Ignore updates that don't contain a message
    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message?.chat?.id;
    const text = message?.text;

    if (!chatId) {
      return NextResponse.json({ ok: true });
    }

    // For now, only handle /start
    if (text !== "/start") {
      return NextResponse.json({ ok: true });
    }

    // Check if this Telegram user already exists
    const { data: existingUser, error: lookupError } = await supabase
      .from("users")
      .select("forwarding_alias")
      .eq("telegram_chat_id", chatId)
      .maybeSingle();

    if (lookupError) {
      console.error("Supabase lookup error:", lookupError);

      return NextResponse.json(
        {
          ok: false,
          error: "Database lookup failed",
        },
        { status: 500 },
      );
    }

    let alias: string;

    if (existingUser) {
      // User already has an alias
      alias = existingUser.forwarding_alias;
    } else {
      // Create a new alias
      alias = await generateUniqueAlias();

      const { error: insertError } = await supabase.from("users").insert({
        telegram_chat_id: chatId,
        forwarding_alias: alias,
      });

      if (insertError) {
        console.error("Supabase insert error:", insertError);

        return NextResponse.json(
          {
            ok: false,
            error: "Could not create user",
          },
          { status: 500 },
        );
      }
    }

    const domain = process.env.UNSUB_EMAIL_DOMAIN || "unsub.app";

    const unsubEmail = `${alias}@${domain}`;

    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      console.error("TELEGRAM_BOT_TOKEN is missing");

      return NextResponse.json(
        {
          ok: false,
          error: "Telegram token is not configured",
        },
        { status: 500 },
      );
    }

    // Send the forwarding address back to the user
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,

          text:
            `👋 Welcome to Unsub!\n\n` +
            `Your personal Unsub address is:\n\n` +
            `📧 ${unsubEmail}\n\n` +
            `Choose how you want Unsub to track your subscriptions:`,

          reply_markup: {
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
          },
        }),
      },
    );

    const telegramData = await telegramResponse.json();

    if (!telegramResponse.ok || !telegramData.ok) {
      console.error("Telegram sendMessage error:", telegramData);

      return NextResponse.json(
        {
          ok: false,
          error: telegramData.description || "Telegram API error",
          telegramError: telegramData,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      alias,
      unsubEmail,
    });
  } catch (error) {
    console.error("Webhook error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}
