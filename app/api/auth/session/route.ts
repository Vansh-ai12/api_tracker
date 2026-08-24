import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensurePublicUserForAuth } from "@/lib/public-user";
import { createServiceClient } from "@/lib/supabase-server";

const SESSION_TTL_DAYS = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const accessToken = String(body?.access_token ?? "");
    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing Supabase session." },
        { status: 401 },
      );
    }

    const supabase = createServiceClient();
    const { data: authData, error: authError } =
      await supabase.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return NextResponse.json(
        { error: "Your sign-in session is invalid or expired." },
        { status: 401 },
      );
    }

    // ------------------------------------------------------------
    // 1. If the browser already has a valid Unsub session,
    //    DO NOT create another user or another session.
    // ------------------------------------------------------------
    const cookieStore = await cookies();
    const existingToken = cookieStore.get("unsub_session")?.value;

    if (existingToken) {
      const { data: existingSession } = await supabase
        .from("web_sessions")
        .select("user_id, expires_at, verified")
        .eq("session_token", existingToken)
        .eq("verified", true)
        .maybeSingle();

      if (
        existingSession &&
        existingSession.user_id &&
        new Date(existingSession.expires_at) > new Date()
      ) {
        return NextResponse.json({ ok: true, existing: true });
      }
    }

    // ------------------------------------------------------------
    // 2. Find the EXISTING public user first.
    //    Prefer auth_user_id, then fall back to Gmail email.
    //    This prevents the Telegram user and web user from becoming
    //    two separate rows.
    // ------------------------------------------------------------
    let userId: string | null = null;

    const authEmail = authData.user.email?.trim().toLowerCase() || null;

    const { data: authUser } = await supabase
      .from("users")
      .select("id")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();

    if (authUser) {
      userId = authUser.id;
    }

    // If there is no auth_user_id match, try the Gmail email.
    // This is the important part for your current database:
    // afa983... already owns vj2754108@gmail.com.
    if (!userId && authEmail) {
      const { data: gmailUser } = await supabase
        .from("users")
        .select("id")
        .ilike("gmail_email", authEmail)
        .maybeSingle();

      if (gmailUser) {
        userId = gmailUser.id;

        // Attach the existing user to the Supabase Auth user.
        const { error: linkError } = await supabase
          .from("users")
          .update({
            auth_user_id: authData.user.id,
          })
          .eq("id", userId);

        if (linkError) {
          console.error(
            "[auth/session] Failed to link existing user:",
            linkError,
          );
          throw linkError;
        }
      }
    }

    // Only create a public user if absolutely no existing user was found.
    if (!userId) {
      userId = await ensurePublicUserForAuth(
        authData.user.id,
        authData.user.email,
      );
    }

    // ------------------------------------------------------------
    // 3. Create the application session for THAT existing user.
    // ------------------------------------------------------------
    const sessionToken = randomBytes(32).toString("hex");

    const expiresAt = new Date(
      Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error: sessionError } = await supabase.from("web_sessions").insert({
      user_id: userId,
      session_token: sessionToken,
      expires_at: expiresAt,
      verified: true,
    });

    if (sessionError) throw sessionError;

    // ------------------------------------------------------------
    // 4. Persist the session in the browser for 30 days.
    // ------------------------------------------------------------
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
    console.error(
      "[auth/session] Could not create application session:",
      error,
    );
    const detail =
      error?.message ||
      error?.details ||
      "Unsub’s database is not ready. Apply the Supabase migration and try again.";
    return NextResponse.json(
      { error: `Database error: ${detail}` },
      { status: 500 },
    );
  }
}
