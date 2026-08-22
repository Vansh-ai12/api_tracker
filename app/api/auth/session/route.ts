import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { ensurePublicUserForAuth } from "@/lib/public-user";
import { createServiceClient } from "@/lib/supabase-server";

const SESSION_TTL_DAYS = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const accessToken = String(body?.access_token ?? "");
    if (!accessToken) {
      return NextResponse.json({ error: "Missing Supabase session." }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Your sign-in session is invalid or expired." }, { status: 401 });
    }

    const userId = await ensurePublicUserForAuth(authData.user.id);
    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error: sessionError } = await supabase.from("web_sessions").insert({
      user_id: userId,
      session_token: sessionToken,
      expires_at: expiresAt,
      verified: true,
    });

    if (sessionError) throw sessionError;

    const response = NextResponse.json({ ok: true });
    response.cookies.set("unsub_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
      path: "/",
    });
    return response;
  } catch (error: any) {
    console.error("[auth/session] Could not create application session:", error);
    const detail = error?.message || error?.details || "Unsub’s database is not ready. Apply the Supabase migration and try again.";
    return NextResponse.json(
      { error: `Database error: ${detail}` },
      { status: 500 },
    );
  }
}
