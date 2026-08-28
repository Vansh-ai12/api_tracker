import "server-only";

import { createServiceClient } from "@/lib/supabase-server";
import { isProUser } from "@/lib/plan";
import { sendPushToUser } from "@/lib/push";

async function sendTelegramReminder(chatId: number, message: string, subscriptionId: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "✅ Keep tracking", callback_data: `still_using:${subscriptionId}` }], [{ text: "🗑️ I cancelled it", callback_data: `mark_cancelled:${subscriptionId}` }]] } }),
    });
    return response.ok;
  } catch { return false; }
}

/** Server-side, idempotent decision and delivery path for renewal reminders. */
export async function runRenewalReminders() {
  const supabase = createServiceClient();
  const today = new Date();
  const todayString = today.toISOString().slice(0, 10);
  const due = new Date(today); due.setDate(today.getDate() + 3);
  const { data: subscriptions, error } = await supabase.from("subscriptions")
    .select("id,user_id,service_name,amount,currency,renewal_date,users(telegram_chat_id)")
    .eq("status", "active").gte("renewal_date", todayString).lte("renewal_date", due.toISOString().slice(0, 10));
  if (error) throw new Error("Unable to load due subscriptions");
  let sent = 0; let skipped = 0; let failed = 0;
  for (const subscription of subscriptions || []) {
    if (!subscription.renewal_date || !(await isProUser(subscription.user_id))) { skipped++; continue; }
    const { data: event, error: eventError } = await supabase.from("renewal_notification_events")
      .insert({ user_id: subscription.user_id, subscription_id: subscription.id, renewal_date: subscription.renewal_date, status: "sending" })
      .select("id").maybeSingle();
    if (eventError?.code === "23505") { skipped++; continue; }
    if (eventError || !event) { failed++; continue; }
    const user = Array.isArray(subscription.users) ? subscription.users[0] : subscription.users;
    const symbol = subscription.currency === "USD" ? "$" : subscription.currency === "EUR" ? "€" : "₹";
    const charge = subscription.amount != null ? `${symbol}${subscription.amount}` : "Recurring charge";
    const message = `🔔 <b>Subscription Renewal Alert</b>\n\n<b>${subscription.service_name}</b>\n💰 <b>Amount:</b> ${charge}\n📅 <b>Renews on:</b> ${subscription.renewal_date}`;
    const telegramDelivered = typeof user?.telegram_chat_id === "number" ? await sendTelegramReminder(user.telegram_chat_id, message, subscription.id) : false;
    await sendPushToUser(subscription.user_id, { title: `🔔 ${subscription.service_name} renews on ${subscription.renewal_date}`, body: `${charge} — review in Unsub.`, url: "/dashboard" });
    await supabase.from("renewal_notification_events").update({ status: telegramDelivered ? "sent" : "sent_without_telegram", delivered_at: new Date().toISOString() }).eq("id", event.id);
    await supabase.from("subscriptions").update({ last_nudged_at: new Date().toISOString() }).eq("id", subscription.id);
    sent++;
  }
  return { remindersSent: sent, skipped, failed, totalDue: subscriptions?.length || 0 };
}
