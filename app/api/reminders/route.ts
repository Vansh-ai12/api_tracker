import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";

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

async function sendTelegramMessage(
  chatId: number,
  message: string,
  subscriptionId: string,
) {
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
                text: "✅ Keep tracking",
                callback_data: `still_using:${subscriptionId}`,
              },
            ],
            [
              {
                text: "🗑️ I cancelled it",
                callback_data: `mark_cancelled:${subscriptionId}`,
              },
            ],
            [
              {
                text: "⏰ Remind later",
                callback_data: `remind_later:${subscriptionId}`,
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
 telegram_chat_id,
 plan
)
`,
      )
      .eq("status", "active")
      .gte("renewal_date", todayString)
      .lte("renewal_date", futureString)
      .is("last_nudged_at", null);

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // REMINDER FEATURE GATE: Only users on the Pro plan receive automated renewal nudges
    const proSubscriptions = (subscriptions || []).filter(
      (sub: any) => sub.users?.plan === "pro",
    );

    if (proSubscriptions.length === 0) {
      return NextResponse.json({
        message: "No active Pro reminders due today",
      });
    }

    for (const subscription of proSubscriptions) {
      const chatId = subscription.users.telegram_chat_id;

      // Telegram is optional during account setup. Preserve the existing
      // reminder flow for connected users, while allowing dashboard-first
      // users to connect their bot chat before Telegram reminders begin.
      if (typeof chatId === "number") {
        await sendTelegramMessage(
          chatId,

          `🔔 Subscription Reminder\n\n` +
            `${subscription.service_name}\n` +
            `₹${subscription.amount} ${subscription.currency}\n\n` +
            `Renews on ${subscription.renewal_date}\n\n` +
            `What would you like to do with this subscription?`,

          subscription.id,
        );
      }

      // --- Browser push notification (new, non-blocking) ---
      // A push failure must never prevent the Telegram reminder or
      // the last_nudged_at update from completing.
      try {
        await sendPushToUser(subscription.user_id, {
          title: `🔔 ${subscription.service_name} renews in 3 days`,
          body:
            `${subscription.currency === "INR" ? "₹" : subscription.currency + " "}${subscription.amount ?? "—"} — ` +
            `renewal on ${subscription.renewal_date ?? "unknown date"}. Open Unsub to manage.`,
          url: "/dashboard",
        });
      } catch (pushErr) {
        // Log and continue — never let a push error bubble up.
        console.error(
          "[reminders] Browser push failed for subscription",
          subscription.id,
          pushErr,
        );
      }

      // --- Mark as nudged (unchanged) ---
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
