import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createServiceClient } from "@/lib/supabase-server";
import {
  getLinkedTelegramChatId,
  ONBOARDING_COOKIE,
} from "@/lib/telegram-onboarding";

const SESSION_TTL_DAYS = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Once a code was sent, allow the short-lived pairing link itself to have
    // expired. The OTP still has its own 10-minute expiry and is the proof of
    // control of the linked Telegram chat.
    const linkedTelegramChatId = await getLinkedTelegramChatId({
      allowExpiredLink: true,
    });
    const telegramChatId = linkedTelegramChatId ?? Number(body?.telegram_chat_id);
    const otp = String(body?.otp ?? "").trim();

    if (!telegramChatId || !Number.isInteger(telegramChatId) || !otp) {
      return NextResponse.json(
        { error: "A connected Telegram account and verification code are required" },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();
    const now = new Date().toISOString();

    // Find an unverified, unexpired session matching this chat ID + OTP.
    const { data: session, error: findError } = await supabase
      .from("web_sessions")
      .select("id")
      .eq("telegram_chat_id", telegramChatId)
      .eq("otp", otp)
      .eq("verified", false)
      .gt("expires_at", now)
      .maybeSingle();

    if (findError) {
      console.error("[verify] DB error:", findError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!session) {
      // Invalid OTP, already used, or expired — same response for all.
      return NextResponse.json(
        { error: "Invalid or expired code." },
        { status: 401 },
      );
    }

    // Generate a cryptographically random session token.
    const sessionToken = randomBytes(32).toString("hex");

    const expiresAt = new Date(
      Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Mark the session as verified: set the session token, clear the OTP,
    // and extend expiry to 30 days.
    const { data: updatedSession, error: updateError } = await supabase
      .from("web_sessions")
      .update({
        verified: true,
        session_token: sessionToken,
        otp: null,           // clear OTP — single-use
        expires_at: expiresAt,
      })
      .eq("id", session.id)
      .eq("verified", false)
      .eq("otp", otp)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("[verify] Failed to update session:", updateError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!updatedSession) {
      return NextResponse.json(
        { error: "Invalid or expired code." },
        { status: 401 },
      );
    }

    // Set a secure HTTP-only cookie.
    const response = NextResponse.json({ ok: true });
    response.cookies.set("unsub_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
      path: "/",
    });
    response.cookies.set(ONBOARDING_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("[verify] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
