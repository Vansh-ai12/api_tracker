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

async function sendTelegramMessage(chatId: number, message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        chat_id: chatId,
        text: message,

        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Still using",
                callback_data: "still_using",
              },
            ],
            [
              {
                text: "❌ Cancel subscription",
                callback_data: "cancel_subscription",
              },
            ],
            [
              {
                text: "⏰ Remind later",
                callback_data: "remind_later",
              },
            ],
          ],
        },
      }),
    },
  );

  return response.json();
}

export async function GET() {
  try {
    const today = new Date();

    const futureDate = new Date();

    futureDate.setDate(today.getDate() + 3);

    const todayString = today.toISOString().split("T")[0];

    const futureString = futureDate.toISOString().split("T")[0];

    const { data: subscriptions, error } = await supabase
      .from("subscriptions")
      .select(
        `
*,
users(
 telegram_chat_id
)
`,
      )
      .eq("status", "active")
      .gte("renewal_date", todayString)
      .lte("renewal_date", futureString)
      .is("last_nudged_at", null);
    if (error) {
      console.error(error);

      return NextResponse.json(
        {
          error: "Database error",
        },
        {
          status: 500,
        },
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        message: "No reminders today",
      });
    }

    for (const subscription of subscriptions) {
      const chatId = subscription.users.telegram_chat_id;

      await sendTelegramMessage(
        chatId,

        `🔔 Subscription Reminder\n\n` +
          `${subscription.service_name}\n` +
          `₹${subscription.amount} ${subscription.currency}\n\n` +
          `Renews on ${subscription.renewal_date}\n\n` +
          `Are you still using it?`,
      );

      await supabase
        .from("subscriptions")
        .update({
          last_nudged_at: new Date().toISOString(),
        })
        .eq("id", subscription.id);
    }

    return NextResponse.json({
      success: true,

      sent: subscriptions.length,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Internal server error",
      },
      {
        status: 500,
      },
    );
  }
}
