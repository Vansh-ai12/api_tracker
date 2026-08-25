import { createServiceClient } from "./supabase-server";
import { getFreshAccessToken } from "./gmail-oauth";
import { logAuditEvent } from "./audit-logger";
import Groq from "groq-sdk";

const GMAIL_MESSAGES_ENDPOINT =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages";

export interface ExtractedSubscription {
  service_name: string;
  domain?: string;
  amount: number | null;
  currency: string;
  billing_cycle: "weekly" | "monthly" | "yearly" | null;
  renewal_date: string | null;
  type?: string;
}

/**
 * Validates and normalizes AI-parsed subscription data.
 * Rejects malformed output.
 */
function validateAndNormalizeParsedOutput(
  parsed: any,
): ExtractedSubscription | null {
  if (!parsed || typeof parsed !== "object") return null;
  if (
    !parsed.service_name ||
    typeof parsed.service_name !== "string" ||
    parsed.service_name.trim().length === 0
  ) {
    return null;
  }

  const serviceName = parsed.service_name.trim();
  const domain =
    typeof parsed.domain === "string"
      ? parsed.domain.toLowerCase().trim()
      : undefined;

  let amount: number | null = null;
  if (
    typeof parsed.amount === "number" &&
    !isNaN(parsed.amount) &&
    parsed.amount > 0
  ) {
    amount = parsed.amount;
  } else if (typeof parsed.amount === "string") {
    const num = parseFloat(parsed.amount.replace(/[^0-9.]/g, ""));
    if (!isNaN(num) && num > 0) amount = num;
  }

  const currency =
    typeof parsed.currency === "string" && parsed.currency.length === 3
      ? parsed.currency.toUpperCase()
      : "INR";

  let billingCycle: "weekly" | "monthly" | "yearly" | null = null;
  if (["weekly", "monthly", "yearly"].includes(parsed.billing_cycle)) {
    billingCycle = parsed.billing_cycle;
  }

  let renewalDate: string | null = null;
  if (typeof parsed.renewal_date === "string" && parsed.renewal_date.trim()) {
    const rawDate = parsed.renewal_date.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      renewalDate = rawDate;
    } else if (/^\d{2}-\d{2}$/.test(rawDate)) {
      renewalDate = rawDate;
    }
  }

  return {
    service_name: serviceName,
    domain,
    amount,
    currency,
    billing_cycle: billingCycle,
    renewal_date: renewalDate,
  };
}

/**
 * Parses email content using Groq AI with deterministic fallback.
 */
export async function parseEmailContent(
  emailText: string,
): Promise<ExtractedSubscription | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn(
      "[subscription-scanner] GROQ_API_KEY missing, skipping AI extraction.",
    );
    return null;
  }

  try {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You are an expert email receipt & subscription parser for recurring services (e.g. Netflix, Spotify, ChatGPT, Canva, GitHub, AWS, SaaS, Apple, Google Play).
Return ONLY valid JSON matching this schema:
{
  "service_name": "string (required, e.g. Netflix)",
  "domain": "string (e.g. netflix.com)",
  "amount": number | null,
  "currency": "INR | USD | EUR",
  "billing_cycle": "weekly | monthly | yearly | null",
  "renewal_date": "YYYY-MM-DD | MM-DD | null",
  "type": "subscription | trial | usage | unknown"
}`,
        },
        {
          role: "user",
          content: emailText.substring(0, 4000),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    const cleaned = content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const rawParsed = JSON.parse(cleaned);

    return validateAndNormalizeParsedOutput(rawParsed);
  } catch (error) {
    console.error(
      "[subscription-scanner] Error parsing email with Groq:",
      error,
    );
    return null;
  }
}

/**
 * Decodes body text from Gmail payload structure.
 */
function decodeGmailBody(payload: any): string {
  if (!payload) return "";

  if (payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
      if (part.parts) {
        const nested = decodeGmailBody(part);
        if (nested) return nested;
      }
    }

    // Fallback to text/html if no text/plain found
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = Buffer.from(part.body.data, "base64url").toString("utf-8");
        return html.replace(/<[^>]*>/g, " ");
      }
    }
  }

  return "";
}

/**
 * Computes next valid upcoming renewal date if not explicitly stated.
 */
function inferNextRenewalDate(
  explicitDate: string | null,
  billingCycle: "weekly" | "monthly" | "yearly" | null,
  messageTimestamp?: number,
): string {
  const now = new Date();

  if (explicitDate && /^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) {
    const explicit = new Date(explicitDate);
    if (explicit >= now) {
      return explicitDate;
    }
  }

  const baseDate = messageTimestamp ? new Date(messageTimestamp) : new Date();
  const cycle = billingCycle || "monthly";
  const nextDate = new Date(baseDate);

  if (cycle === "yearly") {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
  } else if (cycle === "weekly") {
    nextDate.setDate(nextDate.getDate() + 7);
  } else {
    nextDate.setMonth(nextDate.getMonth() + 1);
  }

  // Advance cycle if calculated date is already in the past
  while (nextDate < now) {
    if (cycle === "yearly") {
      nextDate.setFullYear(nextDate.getFullYear() + 1);
    } else if (cycle === "weekly") {
      nextDate.setDate(nextDate.getDate() + 7);
    } else {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }
  }

  return nextDate.toISOString().split("T")[0];
}

/**
 * Controlled, paginated inbox scanner.
 * Scans candidate emails, checks deduplication evidence, parses subscriptions, and stores evidence.
 */
export async function runGmailInboxScan(userId: string): Promise<{
  scannedCount: number;
  newSubscriptionsCount: number;
  updatedSubscriptionsCount: number;
  error?: string;
}> {
  const supabase = createServiceClient();

  // 1. Check & acquire scan lock
  const { data: user, error: userError } = await supabase
    .from("users")
    .select(
      "gmail_connected, gmail_refresh_token, gmail_last_scan_status, telegram_chat_id",
    )
    .eq("id", userId)
    .single();

  if (
    userError ||
    !user ||
    !user.gmail_connected ||
    !user.gmail_refresh_token
  ) {
    return {
      scannedCount: 0,
      newSubscriptionsCount: 0,
      updatedSubscriptionsCount: 0,
      error: "Gmail is not connected.",
    };
  }

  // 1. Check & acquire scan lock.
  // Recover a stale lock if the previous scan crashed or was terminated.
  if (user.gmail_last_scan_status === "scanning") {
    const { data: lockUser } = await supabase
      .from("users")
      .select("updated_at")
      .eq("id", userId)
      .single();

    const lockAgeMs = lockUser?.updated_at
      ? Date.now() - new Date(lockUser.updated_at).getTime()
      : 0;

    // A scan should never remain locked indefinitely.
    // Treat locks older than 10 minutes as stale.
    if (lockAgeMs < 10 * 60 * 1000) {
      return {
        scannedCount: 0,
        newSubscriptionsCount: 0,
        updatedSubscriptionsCount: 0,
        error: "A scan is already in progress.",
      };
    }

    console.warn(
      `[subscription-scanner] Recovering stale Gmail scan lock for user ${userId}.`,
    );
  }

  // Acquire the lock.
  const { data: lockResult, error: lockError } = await supabase
    .from("users")
    .update({
      gmail_last_scan_status: "scanning",
      gmail_last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("id")
    .single();

  if (lockError || !lockResult) {
    return {
      scannedCount: 0,
      newSubscriptionsCount: 0,
      updatedSubscriptionsCount: 0,
      error: "Could not start Gmail scan.",
    };
  }

  logAuditEvent("gmail_scan_started", {
    userId,
    telegramChatId: user.telegram_chat_id,
  });

  let scannedCount = 0;
  let newSubscriptionsCount = 0;
  let updatedSubscriptionsCount = 0;

  try {
    // 2. Obtain fresh in-memory access token
    const accessToken = await getFreshAccessToken(user.gmail_refresh_token);

    // 3. Search the ENTIRE Gmail inbox using pagination.
    // Gmail returns at most 100 messages per page, so keep requesting
    // pages until there is no nextPageToken.
    const query = "in:inbox";

    const messages: { id: string; threadId: string }[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const params = new URLSearchParams({
        q: query,
        maxResults: "100",
      });

      if (pageToken) {
        params.set("pageToken", pageToken);
      }

      const searchUrl = `${GMAIL_MESSAGES_ENDPOINT}?${params.toString()}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      let searchRes: Response;

      try {
        searchRes = await fetch(searchUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!searchRes.ok) {
        const errorBody = await searchRes.text().catch(() => "");

        console.error("[subscription-scanner] Gmail API message list failed:", {
          status: searchRes.status,
          body: errorBody,
        });

        throw new Error(
          `Gmail API message list failed with status ${searchRes.status}: ${errorBody || "No error details returned by Google."}`,
        );
      }

      const searchData = await searchRes.json();

      if (Array.isArray(searchData.messages)) {
        messages.push(...searchData.messages);
      }

      pageToken = searchData.nextPageToken || undefined;
    } while (pageToken);

    console.log(
      `[subscription-scanner] Found ${messages.length} messages in Gmail inbox.`,
    );

    for (const msgRef of messages) {
      scannedCount++;

      // 4. Check evidence table for deduplication before downloading body
      const { data: existingEvidence } = await supabase
        .from("subscription_evidence")
        .select("id")
        .eq("user_id", userId)
        .eq("source", "GMAIL")
        .eq("source_message_id", msgRef.id)
        .maybeSingle();

      if (existingEvidence) {
        continue;
      }

      // 5. Fetch message details
      const msgRes = await fetch(
        `${GMAIL_MESSAGES_ENDPOINT}/${msgRef.id}?format=full`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (!msgRes.ok) continue;

      const msgData = await msgRes.json();
      const headers: { name: string; value: string }[] =
        msgData.payload?.headers || [];

      const subjectHeader =
        headers.find((h) => h.name.toLowerCase() === "subject")?.value || "";
      const fromHeader =
        headers.find((h) => h.name.toLowerCase() === "from")?.value || "";

      const bodyText = decodeGmailBody(msgData.payload);
      const fullText = `Subject: ${subjectHeader}\nFrom: ${fromHeader}\n\n${bodyText}`;

      // 6. Parse subscription details with AI
      const parsed = await parseEmailContent(fullText);
      if (!parsed) continue;

      const msgTimestamp = msgData.internalDate
        ? parseInt(msgData.internalDate, 10)
        : undefined;
      const computedRenewalDate = inferNextRenewalDate(
        parsed.renewal_date,
        parsed.billing_cycle,
        msgTimestamp,
      );

      // 7. Upsert subscription record cleanly
      let targetSubId: string | null = null;

      const { data: existingSub } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .ilike("service_name", parsed.service_name)
        .maybeSingle();

      if (existingSub) {
        targetSubId = existingSub.id;
        await supabase
          .from("subscriptions")
          .update({
            amount: parsed.amount ?? undefined,
            currency: parsed.currency,
            billing_cycle: parsed.billing_cycle ?? "monthly",
            renewal_date: computedRenewalDate,
            status: "active",
          })
          .eq("id", existingSub.id);

        updatedSubscriptionsCount++;
      } else {
        const { data: newSub, error: insertSubErr } = await supabase
          .from("subscriptions")
          .insert({
            user_id: userId,
            service_name: parsed.service_name,
            domain: parsed.domain,
            amount: parsed.amount,
            currency: parsed.currency,
            billing_cycle: parsed.billing_cycle || "monthly",
            renewal_date: computedRenewalDate,
            status: "active",
          })
          .select("id")
          .single();

        if (insertSubErr || !newSub) {
          console.error(
            "[subscription-scanner] Sub insert error:",
            insertSubErr,
          );
          continue;
        }

        targetSubId = newSub.id;
        newSubscriptionsCount++;
      }

      // 8. Record evidence to guarantee idempotency
      if (targetSubId) {
        await supabase.from("subscription_evidence").insert({
          subscription_id: targetSubId,
          user_id: userId,
          source: "GMAIL",
          source_message_id: msgRef.id,
          source_thread_id: msgRef.threadId,
          source_sender: fromHeader,
          source_subject: subjectHeader,
        });
      }
    }

    // 9. Update status to completed and persist the exact scan completion time
    const scanCompletedAt = new Date().toISOString();

    const { error: scanCompleteUpdateError } = await supabase
      .from("users")
      .update({
        gmail_last_scan_status: "completed",
        gmail_last_scan_at: scanCompletedAt,
        gmail_last_error: null,
        updated_at: scanCompletedAt,
      })
      .eq("id", userId);

    if (scanCompleteUpdateError) {
      console.error(
        "[subscription-scanner] Failed to save last scan timestamp:",
        scanCompleteUpdateError,
      );

      throw new Error(
        `Failed to save Gmail scan completion state: ${scanCompleteUpdateError.message}`,
      );
    }

    logAuditEvent("gmail_scan_completed", {
      userId,
      telegramChatId: user.telegram_chat_id,
      subscriptionCount: newSubscriptionsCount + updatedSubscriptionsCount,
    });

    return { scannedCount, newSubscriptionsCount, updatedSubscriptionsCount };
  } catch (error: any) {
    console.error("[subscription-scanner] Scan failed:", error);

    const isTokenExpired = Boolean(error?.isTokenExpired);
    const status = isTokenExpired ? "token_expired" : "failed";

    await supabase
      .from("users")
      .update({
        gmail_last_scan_status: status,
        gmail_connected: isTokenExpired ? false : undefined,
        gmail_last_error: error.message,
      })
      .eq("id", userId);

    if (isTokenExpired) {
      logAuditEvent("gmail_token_refresh_failed", {
        userId,
        error: error.message,
      });
      return {
        scannedCount,
        newSubscriptionsCount,
        updatedSubscriptionsCount,
        error: "TOKEN_EXPIRED",
      };
    }

    logAuditEvent("gmail_scan_failed", { userId, error: error.message });

    return {
      scannedCount,
      newSubscriptionsCount,
      updatedSubscriptionsCount,
      error: error.message,
    };
  }
}
