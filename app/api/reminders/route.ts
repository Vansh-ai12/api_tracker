import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { sendPushToUser } from "@/lib/push";
import { runGmailInboxScan } from "@/lib/subscription-scanner";

async function sendTelegramReminder(
  chatId: number,
  message: string,
  subscriptionId: string,
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Keep tracking", callback_data: `still_using:${subscriptionId}` }],
            [{ text: "🗑️ I cancelled it", callback_data: `mark_cancelled:${subscriptionId}` }],
            [{ text: "⏰ Remind later", callback_data: `remind_later:${subscriptionId}` }],
          ],
        },
      }),
    });
  } catch (err) {
    console.error("[reminders] Error sending Telegram reminder:", err);
  }
}

export async function GET() {
  const supabase = createServiceClient();

  try {
    // 1. Regular Background Scan for connected Gmail users
    const { data: connectedUsers } = await supabase
      .from("users")
      .select("id, gmail_last_scan_at, gmail_last_scan_status")
      .eq("gmail_connected", true);

    if (connectedUsers && connectedUsers.length > 0) {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      for (const u of connectedUsers) {
        if (
          u.gmail_last_scan_status !== "scanning" &&
          (!u.gmail_last_scan_at || u.gmail_last_scan_at < sixHoursAgo)
        ) {
          // Asynchronously scan inbox to refresh subscriptions
          runGmailInboxScan(u.id).catch((err) =>
            console.error(`[reminders] Background scan failed for user ${u.id}:`, err)
          );
        }
      }
    }

    // 2. Advance renewal dates for active subscriptions that have passed
    const now = new Date();
    const todayString = now.toISOString().split("T")[0];

    const { data: pastSubscriptions } = await supabase
      .from("subscriptions")
      .select("id, renewal_date, billing_cycle")
      .eq("status", "active")
      .lt("renewal_date", todayString);

    if (pastSubscriptions && pastSubscriptions.length > 0) {
      for (const sub of pastSubscriptions) {
        if (sub.renewal_date) {
          const nextDate = new Date(sub.renewal_date);
          const cycle = sub.billing_cycle || "monthly";

          while (nextDate < now) {
            if (cycle === "yearly") {
              nextDate.setFullYear(nextDate.getFullYear() + 1);
            } else if (cycle === "weekly") {
              nextDate.setDate(nextDate.getDate() + 7);
            } else {
              nextDate.setMonth(nextDate.getMonth() + 1);
            }
          }

          await supabase
            .from("subscriptions")
            .update({
              renewal_date: nextDate.toISOString().split("T")[0],
              last_nudged_at: null, // Reset nudge for new cycle
            })
            .eq("id", sub.id);
        }
      }
    }

    // 3. Find active subscriptions due within the next 3 days
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + 3);
    const futureString = futureDate.toISOString().split("T")[0];

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: dueSubscriptions, error } = await supabase
      .from("subscriptions")
      .select(`
        id,
        user_id,
        service_name,
        amount,
        currency,
        renewal_date,
        last_nudged_at,
        users (
          telegram_chat_id,
          plan
        )
      `)
      .eq("status", "active")
      .gte("renewal_date", todayString)
      .lte("renewal_date", futureString);

    if (error) {
      console.error("[reminders] Error fetching subscriptions:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    let nudgedCount = 0;

    for (const subscription of dueSubscriptions || []) {
      const user = Array.isArray(subscription.users) ? subscription.users[0] : subscription.users;
      if (!user) continue;

      // Allow re-nudging if last nudge was in a prior cycle (more than 7 days ago) or null
      if (subscription.last_nudged_at && subscription.last_nudged_at > sevenDaysAgo) {
        continue;
      }

      const chatId = user.telegram_chat_id;
      const currencySymbol = subscription.currency === "USD" ? "$" : subscription.currency === "EUR" ? "€" : "₹";
      const amountDisplay = subscription.amount ? `${currencySymbol}${subscription.amount}` : "Recurring charge";

      // 1. Send Telegram Notification
      if (typeof chatId === "number" && chatId > 0) {
        await sendTelegramReminder(
          chatId,
          `🔔 <b>Subscription Renewal Alert</b>\n\n` +
            `<b>${subscription.service_name}</b>\n` +
            `💰 <b>Amount:</b> ${amountDisplay}\n` +
            `📅 <b>Renews on:</b> ${subscription.renewal_date}\n\n` +
            `Would you like to keep this subscription active?`,
          subscription.id,
        );
      }

      // 2. Send Browser Push Notification
      try {
        await sendPushToUser(subscription.user_id, {
          title: `🔔 ${subscription.service_name} renews on ${subscription.renewal_date}`,
          body: `${amountDisplay} — renewal in 3 days. Tap to review in Unsub.`,
          url: "/dashboard",
        });
      } catch (pushErr) {
        console.error("[reminders] Browser push failed for sub:", subscription.id, pushErr);
      }

      // 3. Mark as nudged
      await supabase
        .from("subscriptions")
        .update({ last_nudged_at: new Date().toISOString() })
        .eq("id", subscription.id);

      nudgedCount++;
    }

    return NextResponse.json({
      success: true,
      remindersSent: nudgedCount,
      totalDue: dueSubscriptions?.length || 0,
    });
  } catch (error: any) {
    console.error("[reminders] Internal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
