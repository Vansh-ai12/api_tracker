import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createServiceClient } from "@/lib/supabase-server";
import { getLinkedTelegramChatId } from "@/lib/telegram-onboarding";

const RATE_LIMIT_SECONDS = 60; // minimum gap between OTP requests
const OTP_TTL_MINUTES = 10;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const linkedTelegramChatId = await getLinkedTelegramChatId();
    // Keep the direct ID path for existing API clients, but prefer the
    // browser-to-bot association established by /start.
    const telegramChatId = linkedTelegramChatId ?? Number(body?.telegram_chat_id);

    if (!telegramChatId || !Number.isInteger(telegramChatId)) {
      return NextResponse.json(
        { error: "Start the Telegram bot to connect your account first." },
        { status: 400 },
      );
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.error("[request-login] TELEGRAM_BOT_TOKEN is missing");
      return NextResponse.json(
        { error: "Telegram login is not configured." },
        { status: 503 },
      );
    }

    const supabase = createServiceClient();

    // 1. Ensure this telegram_chat_id is a registered Unsub user.
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_chat_id", telegramChatId)
      .maybeSingle();

    if (userError) {
      console.error("[request-login] DB error looking up user:", userError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!user) {
      // Don't reveal whether the ID exists — return the same shape.
      return NextResponse.json(
        { error: "No Unsub account found for this Telegram ID. Start the bot first." },
        { status: 404 },
      );
    }

    // 2. Rate-limit: reject if an unverified OTP was issued within the last 60 s.
    const rateLimitCutoff = new Date(
      Date.now() - RATE_LIMIT_SECONDS * 1000,
    ).toISOString();

    const { data: recentSession, error: recentSessionError } = await supabase
      .from("web_sessions")
      .select("id, created_at")
      .eq("telegram_chat_id", telegramChatId)
      .eq("verified", false)
      .gte("created_at", rateLimitCutoff)
      .maybeSingle();

    if (recentSessionError) {
      console.error("[request-login] Failed to check the OTP rate limit:", recentSessionError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (recentSession) {
      return NextResponse.json(
        { error: "Please wait before requesting another code." },
        { status: 429 },
      );
    }

    // 3. Invalidate all previous unverified OTPs for this chat ID.
    await supabase
      .from("web_sessions")
      .delete()
      .eq("telegram_chat_id", telegramChatId)
      .eq("verified", false);

    // 4. Generate a cryptographically random 6-digit OTP.
    const otp = randomInt(100000, 1000000).toString(); // 100000–999999

    const expiresAt = new Date(
      Date.now() + OTP_TTL_MINUTES * 60 * 1000,
    ).toISOString();

    const { data: newSession, error: insertError } = await supabase
      .from("web_sessions")
      .insert({
        user_id: user.id,
        telegram_chat_id: telegramChatId,
        otp,
        expires_at: expiresAt,
        verified: false,
      })
      .select("id")
      .single();

    if (insertError || !newSession) {
      console.error("[request-login] Failed to insert session:", insertError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // 5. Send OTP to the user via the Telegram bot DM.
    const tgRes = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text:
            `🔑 Your Unsub login code is:\n\n` +
            `*${otp}*\n\n` +
            `It expires in ${OTP_TTL_MINUTES} minutes. ` +
            `If you didn't request this, ignore it.`,
          parse_mode: "Markdown",
        }),
      },
    );

    const tgData = await tgRes.json().catch(() => null);
    if (!tgRes.ok || !tgData?.ok) {
      console.error("[request-login] Telegram sendMessage failed:", tgData);
      // Do not leave an unusable OTP behind or rate-limit the user when
      // Telegram did not accept the message.
      await supabase.from("web_sessions").delete().eq("id", newSession.id);
      return NextResponse.json(
        { error: "We could not send a code to Telegram. Please open the bot and try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[request-login] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
