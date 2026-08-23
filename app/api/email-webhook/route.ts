import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseEmailContent } from "@/lib/subscription-scanner";
import { logAuditEvent } from "@/lib/audit-logger";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(request: Request) {
  try {
    // 1. Verify Webhook Authorization / Secret if configured
    const expectedSecret = process.env.EMAIL_WEBHOOK_SECRET;
    if (expectedSecret) {
      const authHeader = request.headers.get("x-email-webhook-secret") || request.headers.get("authorization");
      if (authHeader !== expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
        console.warn("[email-webhook] Unauthorized webhook attempt - invalid secret.");
        logAuditEvent("email_webhook_failed", { error: "Unauthorized webhook secret" });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const emailPayload = await request.json();
    console.log("[email-webhook] Inbound email payload:", JSON.stringify(emailPayload));

    const recipient = emailPayload.to || emailPayload.recipient;
    if (!recipient) {
      return NextResponse.json({ error: "Missing recipient address" }, { status: 400 });
    }

    const alias = recipient.split("@")[0].toLowerCase().trim();
    const messageId = emailPayload.message_id || emailPayload.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 2. Look up canonical user by forwarding alias
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, telegram_chat_id")
      .eq("forwarding_alias", alias)
      .maybeSingle();

    if (userError || !user) {
      console.warn(`[email-webhook] No user found for alias: ${alias}`);
      return NextResponse.json({ error: "User not found for forwarding alias" }, { status: 404 });
    }

    // 3. Deduplication Check against subscription_evidence
    const { data: existingEvidence } = await supabase
      .from("subscription_evidence")
      .select("id")
      .eq("user_id", user.id)
      .eq("source", "PRIVATE_EMAIL")
      .eq("source_message_id", messageId)
      .maybeSingle();

    if (existingEvidence) {
      console.log(`[email-webhook] Duplicate email message ${messageId} skipped.`);
      return NextResponse.json({ success: true, message: "Duplicate email skipped" });
    }

    // 4. Save raw email for audit
    const rawContent = JSON.stringify(emailPayload);
    const { data: rawEmail } = await supabase
      .from("raw_emails")
      .insert({
        user_id: user.id,
        raw_content: rawContent,
        parse_status: "pending",
      })
      .select("id")
      .single();

    // 5. Extract subscription details with AI parser
    const emailText = `Subject: ${emailPayload.subject || ""}\nFrom: ${emailPayload.from || ""}\n\n${emailPayload.text || emailPayload.html || rawContent}`;
    const parsed = await parseEmailContent(emailText);

    if (rawEmail) {
      await supabase
        .from("raw_emails")
        .update({ parse_status: parsed ? "parsed" : "failed" })
        .eq("id", rawEmail.id);
    }

    if (!parsed) {
      return NextResponse.json({ success: true, message: "Email processed, no subscription detected." });
    }

    // 6. Upsert subscription record cleanly
    let targetSubId: string | null = null;
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .ilike("service_name", parsed.service_name)
      .maybeSingle();

    if (existingSub) {
      targetSubId = existingSub.id;
      await supabase
        .from("subscriptions")
        .update({
          amount: parsed.amount ?? undefined,
          currency: parsed.currency,
          billing_cycle: parsed.billing_cycle ?? undefined,
          renewal_date: parsed.renewal_date ?? undefined,
          status: "active",
        })
        .eq("id", existingSub.id);
    } else {
      const { data: newSub } = await supabase
        .from("subscriptions")
        .insert({
          user_id: user.id,
          service_name: parsed.service_name,
          domain: parsed.domain,
          amount: parsed.amount,
          currency: parsed.currency,
          billing_cycle: parsed.billing_cycle,
          renewal_date: parsed.renewal_date,
          status: "active",
        })
        .select("id")
        .single();

      if (newSub) targetSubId = newSub.id;
    }

    // 7. Store evidence record for idempotency
    if (targetSubId) {
      await supabase.from("subscription_evidence").insert({
        subscription_id: targetSubId,
        user_id: user.id,
        source: "PRIVATE_EMAIL",
        source_message_id: messageId,
        source_sender: emailPayload.from || null,
        source_subject: emailPayload.subject || null,
      });
    }

    logAuditEvent("email_webhook_received", { userId: user.id, telegramChatId: user.telegram_chat_id });

    // 8. Send Telegram alert to user
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token && user.telegram_chat_id) {
      const amountStr = parsed.amount ? `${parsed.currency === "INR" ? "₹" : parsed.currency} ${parsed.amount}` : "Amount unspecified";
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: user.telegram_chat_id,
          text:
            `📬 *New Subscription Detected via Forwarding\\!*\n\n` +
            `• *Service:* ${parsed.service_name}\n` +
            `• *Amount:* ${amountStr}\n` +
            `• *Billing Cycle:* ${parsed.billing_cycle || "Monthly"}\n` +
            `• *Renewal Date:* ${parsed.renewal_date || "Not specified"}\n\n` +
            `Unsub will remind you 3 days before renewal date\\!`,
          parse_mode: "MarkdownV2",
        }),
      });
    }

    return NextResponse.json({
      success: true,
      message: "Email processed and subscription recorded.",
      subscription: parsed,
    });
  } catch (error: any) {
    console.error("[email-webhook] Error processing inbound email:", error);
    logAuditEvent("email_webhook_failed", { error: error.message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
