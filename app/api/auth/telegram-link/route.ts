import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ONBOARDING_COOKIE } from "@/lib/telegram-onboarding";
import { getSessionUserId } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase-server";

const LINK_TTL_MINUTES = 15;
const BOT_USERNAME = "UnsubGbot";

export async function POST() {
  try {
    const supabase = createServiceClient();
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign in to connect Telegram." }, { status: 401 });
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("telegram_chat_id")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !user) {
      console.error("[telegram-link] Failed to find signed-in user:", userError);
      return NextResponse.json({ error: "Could not start Telegram setup." }, { status: 500 });
    }

    if (user.telegram_chat_id !== null) {
      return NextResponse.json({ connected: true });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(ONBOARDING_COOKIE)?.value;

    if (token) {
      const { data: existingLink, error: existingLinkError } = await supabase
        .from("telegram_login_links")
        .select("link_token")
        .eq("link_token", token)
        .eq("user_id", userId)
        .is("telegram_chat_id", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (existingLinkError) {
        console.error("[telegram-link] Failed to look up existing link:", existingLinkError);
      }

      if (existingLink) {
        return NextResponse.json({
          telegram_url: `https://t.me/${BOT_USERNAME}?start=login_${existingLink.link_token}`,
        });
      }
    }

    // Telegram start payloads allow URL-safe base64. The 43-character token
    // keeps the complete `login_...` payload safely below Telegram's limit.
    const linkToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + LINK_TTL_MINUTES * 60 * 1000).toISOString();

    const { error: insertError } = await supabase
      .from("telegram_login_links")
      .insert({ link_token: linkToken, user_id: userId, expires_at: expiresAt });

    if (insertError) {
      console.error("[telegram-link] Failed to create link record, falling back to direct bot link:", insertError);
      return NextResponse.json({
        telegram_url: `https://t.me/${BOT_USERNAME}`,
      });
    }

    const response = NextResponse.json({
      telegram_url: `https://t.me/${BOT_USERNAME}?start=login_${linkToken}`,
    });
    response.cookies.set(ONBOARDING_COOKIE, linkToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: LINK_TTL_MINUTES * 60,
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("[telegram-link] Unexpected error:", error);
    return NextResponse.json({ error: "Could not start Telegram setup." }, { status: 500 });
  }
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to connect Telegram." }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: user, error } = await supabase
    .from("users")
    .select("telegram_chat_id")
    .eq("id", userId)
    .maybeSingle();

  if (error || !user) {
    console.error("[telegram-link] Failed to check Telegram connection:", error);
    return NextResponse.json({ error: "Could not check Telegram connection." }, { status: 500 });
  }

  return NextResponse.json({ connected: user.telegram_chat_id !== null });
}
