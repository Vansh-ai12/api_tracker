import "server-only";

import { createServiceClient } from "@/lib/supabase-server";

type BillingEventType =
  | "invoice" | "payment_receipt" | "payment_failure" | "credit_purchase"
  | "credit_balance" | "quota_warning" | "spending_alert" | "usage_threshold"
  | "subscription_change" | "renewal_notification" | "account_change" | "billing_change";

const PROVIDERS = [
  { provider: "openai", domains: ["openai.com"], words: ["openai", "chatgpt"] },
  { provider: "anthropic", domains: ["anthropic.com"], words: ["anthropic", "claude"] },
  { provider: "gemini", domains: ["google.com", "googleapis.com", "googlecloud.com"], words: ["gemini", "google cloud", "google ai"] },
] as const;

function findProvider(from: string, text: string) {
  const value = `${from} ${text}`.toLowerCase();
  return PROVIDERS.find((candidate) =>
    candidate.domains.some((domain) => from.toLowerCase().includes(domain)) ||
    candidate.words.some((word) => value.includes(word)),
  )?.provider;
}

function classify(text: string): BillingEventType | null {
  const value = text.toLowerCase();
  if (/payment (failed|declined)|failed payment|past due/.test(value)) return "payment_failure";
  if (/invoice|tax invoice/.test(value)) return "invoice";
  if (/receipt|payment (received|confirmed)|charged/.test(value)) return "payment_receipt";
  if (/credit (purchase|added|top.?up)/.test(value)) return "credit_purchase";
  if (/credit balance|remaining credits/.test(value)) return "credit_balance";
  if (/quota|rate limit/.test(value)) return "quota_warning";
  if (/spend|budget|billing alert/.test(value)) return "spending_alert";
  if (/usage (alert|threshold|limit)/.test(value)) return "usage_threshold";
  if (/renewal|renews/.test(value)) return "renewal_notification";
  if (/subscription (change|updated|cancel)/.test(value)) return "subscription_change";
  if (/billing account|payment method/.test(value)) return "billing_change";
  return null;
}

function findAmount(text: string) {
  const match = text.match(/(?:₹|\$|€|USD\s?|INR\s?|EUR\s?)([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  if (!match) return { amount: null, currency: null };
  const marker = match[0].toUpperCase();
  return {
    amount: Number(match[1].replace(/,/g, "")),
    currency: marker.includes("₹") || marker.includes("INR") ? "INR" : marker.includes("€") || marker.includes("EUR") ? "EUR" : "USD",
  };
}

/** Stores only a classified email signal; it never becomes a provider usage metric. */
export async function recordProviderBillingSignal(input: {
  userId: string; sourceEmailId: string; from: string; subject: string; body: string; eventDate?: string;
}) {
  const provider = findProvider(input.from, `${input.subject}\n${input.body}`);
  const eventType = classify(`${input.subject}\n${input.body}`);
  if (!provider || !eventType) return false;
  const { amount, currency } = findAmount(`${input.subject}\n${input.body}`);
  const invoiceId = `${input.subject}\n${input.body}`.match(/(?:invoice|receipt)\s*(?:#|no\.?|id)?\s*([A-Z0-9-]{5,})/i)?.[1] || null;
  const supabase = createServiceClient();
  const { error } = await supabase.from("provider_billing_events").upsert({
    user_id: input.userId, provider, event_type: eventType, event_date: input.eventDate || new Date().toISOString(),
    amount, currency: currency || "USD", invoice_id: invoiceId, description: input.subject.slice(0, 500),
    source_email_id: input.sourceEmailId, source_email_from: input.from.slice(0, 320), source_email_subject: input.subject.slice(0, 500),
    confidence: 0.9, metadata: { source: "gmail", classification: "rules" },
  }, { onConflict: "user_id,source_email_id", ignoreDuplicates: true });
  if (error) console.error("[billing-signals] unable to store signal", { code: error.code, message: error.message });
  return !error;
}
