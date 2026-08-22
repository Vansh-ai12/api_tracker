import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase-server";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("unsub_session")?.value;

    if (sessionToken) {
      // Delete the session row from the database.
      const supabase = createServiceClient();
      await supabase
        .from("web_sessions")
        .delete()
        .eq("session_token", sessionToken);
    }

    // Clear the cookie regardless of whether a DB row existed.
    const response = NextResponse.json({ ok: true });
    response.cookies.set("unsub_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("[logout] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
