import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const PRO_PLAN_PRICE_INR_PAISE = 4900; // ₹49.00 INR = 4900 paise

export async function POST() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    // If Razorpay API credentials exist, generate a live Razorpay order
    if (keyId && keySecret) {
      const authHeader = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      const res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: PRO_PLAN_PRICE_INR_PAISE,
          currency: "INR",
          receipt: `receipt_${userId.slice(0, 8)}_${Date.now()}`,
          notes: {
            user_id: userId,
            plan: "pro",
          },
        }),
      });

      const orderData = await res.json();
      if (!res.ok) {
        console.error("[payments/create-order] Razorpay API error:", orderData);
        return NextResponse.json(
          { error: orderData.error?.description || "Failed to create Razorpay payment order." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        orderId: orderData.id,
        amount: PRO_PLAN_PRICE_INR_PAISE,
        currency: "INR",
        keyId,
        demo: false,
      });
    }

    // Demo Mode fallback when API keys are not configured yet
    return NextResponse.json({
      orderId: `demo_order_${Date.now()}`,
      amount: PRO_PLAN_PRICE_INR_PAISE,
      currency: "INR",
      keyId: "demo_key",
      demo: true,
    });
  } catch (error) {
    console.error("[payments/create-order] Internal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
