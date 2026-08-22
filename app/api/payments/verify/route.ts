import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSessionUserId } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, is_demo } = body;

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!razorpay_order_id || !razorpay_payment_id) {
      return NextResponse.json({ error: "Payment verification requires completed Razorpay checkout parameters." }, { status: 400 });
    }

    if (keySecret) {
      if (!razorpay_signature) {
        return NextResponse.json({ error: "Missing payment signature." }, { status: 400 });
      }

      const generatedSignature = crypto
        .createHmac("sha256", keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (generatedSignature !== razorpay_signature) {
        return NextResponse.json({ error: "Payment verification failed: Invalid Razorpay signature." }, { status: 400 });
      }
    }

    // Upgrade user plan to Pro in database
    const supabase = createServiceClient();
    const { error: updateError } = await supabase
      .from("users")
      .update({ plan: "pro" })
      .eq("id", userId);

    if (updateError) {
      console.error("[payments/verify] Failed to update user plan:", updateError);
      return NextResponse.json({ error: "Could not activate Pro plan." }, { status: 500 });
    }

    return NextResponse.json({ success: true, plan: "pro" });
  } catch (error) {
    console.error("[payments/verify] Internal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
