import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase-server";
import { isProUser } from "@/lib/plan";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch user's integration status
  const { data: user } = await supabase
    .from("users")
    .select(
      "gmail_connected, gmail_connected_at, gmail_last_scan_at, telegram_chat_id, plan"
    )
    .eq("id", userId)
    .maybeSingle();

  const integrations = [];

  // Gmail API
  integrations.push({
    name: "Gmail API",
    purpose: "Read recent subscription/receipt/renewal emails",
    access: "Read-only",
    status: user?.gmail_connected ? "connected" : "not_connected",
    lastUsed: user?.gmail_last_scan_at || null,
    icon: "📧",
  });

  // Google OAuth
  integrations.push({
    name: "Google OAuth",
    purpose: "Authenticate and authorize Gmail access",
    access: "OAuth 2.0",
    status: user?.gmail_connected ? "connected" : "not_connected",
    lastUsed: user?.gmail_connected_at || null,
    icon: "🔐",
  });

  // AI/LLM API (Groq)
  const groqAvailable = !!process.env.GROQ_API_KEY;
  integrations.push({
    name: "AI Parser (Groq)",
    purpose: "Parse emails and extract subscription information",
    access: "API Key",
    status: groqAvailable ? "available" : "error",
    lastUsed: null,
    icon: "🤖",
  });

  // Telegram Bot API
  const telegramAvailable = !!process.env.TELEGRAM_BOT_TOKEN;
  integrations.push({
    name: "Telegram Bot API",
    purpose: "Send renewal reminders",
    access: "Bot Token",
    status: user?.telegram_chat_id ? "connected" : telegramAvailable ? "available" : "not_connected",
    lastUsed: null,
    icon: "📱",
  });

  // Browser Notifications (Web Push) — Pro-only
  const isPro = await isProUser(userId);
  integrations.push({
    name: "Browser Notifications",
    purpose: "Browser-based renewal alerts",
    access: "Web Push API",
    status: isPro ? "available" : "not_connected",
    lastUsed: null,
    icon: "🔔",
  });

  return NextResponse.json({ integrations });
}
