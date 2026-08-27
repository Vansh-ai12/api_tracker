import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase-server";
import {
  requireSubscriptionSlot,
  rollbackIfOverSubscriptionLimit,
} from "@/lib/plan";

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { service_name, amount, currency, billing_cycle, renewal_date } = body;

    // Validate required fields
    if (!service_name || typeof service_name !== "string" || service_name.trim().length === 0) {
      return NextResponse.json({ error: "Service name is required" }, { status: 400 });
    }

    // Validate amount if provided
    if (amount !== undefined && amount !== null) {
      const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
      if (isNaN(numAmount) || numAmount <= 0) {
        return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
      }
    }

    // Validate currency
    const validCurrencies = ["INR", "USD", "EUR", "GBP", "JPY", "CAD", "AUD"];
    const normalizedCurrency = (currency || "INR").toUpperCase().trim();
    if (!validCurrencies.includes(normalizedCurrency)) {
      return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
    }

    // Validate billing cycle
    const validCycles = ["weekly", "monthly", "yearly"];
    const normalizedCycle = billing_cycle?.toLowerCase().trim();
    if (normalizedCycle && !validCycles.includes(normalizedCycle)) {
      return NextResponse.json({ error: "Invalid billing cycle" }, { status: 400 });
    }

    // Validate renewal date if provided
    if (renewal_date) {
      const date = new Date(renewal_date);
      if (isNaN(date.getTime())) {
        return NextResponse.json({ error: "Invalid renewal date" }, { status: 400 });
      }
    }

    const supabase = createServiceClient();

    // Check if subscription with same service name already exists
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .ilike("service_name", service_name.trim())
      .maybeSingle();

    if (existingSub) {
      return NextResponse.json({ error: "Subscription with this name already exists" }, { status: 409 });
    }

    const limitError = await requireSubscriptionSlot(userId);
    if (limitError) return limitError;

    // Insert the new subscription
    const { data: newSub, error: insertError } = await supabase
      .from("subscriptions")
      .insert({
        user_id: userId,
        service_name: service_name.trim(),
        amount: amount !== undefined && amount !== null ? parseFloat(String(amount)) : null,
        currency: normalizedCurrency,
        billing_cycle: normalizedCycle || "monthly",
        renewal_date: renewal_date || null,
        status: "active",
      })
      .select("id, service_name, amount, currency, billing_cycle, renewal_date, status")
      .single();

    if (insertError || !newSub) {
      console.error("[api/subscriptions] Insert error:", insertError);
      return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
    }

    const raceLimitError = await rollbackIfOverSubscriptionLimit(userId, newSub.id);
    if (raceLimitError) return raceLimitError;

    return NextResponse.json({ success: true, subscription: newSub });
  } catch (error: any) {
    console.error("[api/subscriptions] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
