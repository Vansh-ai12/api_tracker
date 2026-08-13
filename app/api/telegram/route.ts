import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
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
    alias += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
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

export async function POST(request: Request) {
  try {
    const update = await request.json();

    console.log(
      "Telegram webhook update:",
      JSON.stringify(update)
    );

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

    // For now, we only handle /start
    if (text !== "/start") {
      return NextResponse.json({ ok: true });
    }

    /*
     * Check if this Telegram user already exists.
     * This prevents creating a new alias every time
     * the user sends /start.
     */
    const { data: existingUser, error: lookupError } =
      await supabase
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
        { status: 500 }
      );
    }

    let alias: string;

    if (existingUser) {
      // User already exists
      alias = existingUser.forwarding_alias;
    } else {
      // Generate a new unique alias
      alias = await generateUniqueAlias();

      const { error: insertError } = await supabase
        .from("users")
        .insert({
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
          { status: 500 }
        );
      }
    }

    const domain =
      process.env.UNSUB_EMAIL_DOMAIN || "unsub.app";

    const forwardingEmail = `${alias}@${domain}`;

    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      console.error("TELEGRAM_BOT_TOKEN is missing");

      return NextResponse.json(
        {
          ok: false,
          error: "Telegram token is not configured",
        },
        { status: 500 }
      );
    }

    /*
     * Send the forwarding address back to the user
     */
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
            `Your personal forwarding address is:\n\n` +
            `📧 ${forwardingEmail}\n\n` +
            `Forward your subscription receipts to this address ` +
            `and I'll track them for you.`,
        }),
      }
    );

    const telegramData = await telegramResponse.json();

    if (!telegramResponse.ok || !telegramData.ok) {
      console.error(
        "Telegram sendMessage error:",
        telegramData
      );

      return NextResponse.json(
        {
          ok: false,
          error: telegramData.description || "Telegram API error",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      alias,
      forwardingEmail,
    });
  } catch (error) {
    console.error("Webhook error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}