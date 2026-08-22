import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { getSessionUserId } from "@/lib/session";

export async function POST(req: Request) {
  try {
    // Resolve authenticated user from the HTTP-only session cookie.
    // Never trust a user_id supplied by the request body.
    const userId = await getSessionUserId();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorised — please sign in first." },
        { status: 401 },
      );
    }

    const body = await req.json();
    const subscription = body?.subscription as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    } | undefined;

    if (
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth
    ) {
      return NextResponse.json(
        { error: "Invalid subscription object." },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    // Upsert on endpoint (unique constraint) so re-subscribing the same
    // browser device updates the keys rather than creating a duplicate.
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      { onConflict: "endpoint" },
    );

    if (error) {
      console.error("[subscribe] DB upsert error:", error);
      return NextResponse.json({ error: "Database error." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[subscribe] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}