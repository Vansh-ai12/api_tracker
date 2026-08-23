/**
 * Audit Logger for non-sensitive application and security events.
 * Ensures credentials, tokens, codes, and message contents are NEVER logged.
 */

export type AuditEventType =
  | "gmail_oauth_started"
  | "gmail_oauth_completed"
  | "gmail_oauth_failed"
  | "gmail_scan_started"
  | "gmail_scan_completed"
  | "gmail_scan_failed"
  | "gmail_disconnected"
  | "private_mode_enabled"
  | "email_webhook_received"
  | "email_webhook_failed";

export function logAuditEvent(
  event: AuditEventType,
  metadata?: {
    userId?: string;
    telegramChatId?: number;
    emailDomain?: string;
    subscriptionCount?: number;
    error?: string;
  }
) {
  const timestamp = new Date().toISOString();
  const safeLog = {
    timestamp,
    event,
    userId: metadata?.userId || null,
    telegramChatId: metadata?.telegramChatId || null,
    subscriptionCount: metadata?.subscriptionCount ?? null,
    error: metadata?.error ? metadata.error.substring(0, 200) : null,
  };

  console.log(`[AUDIT] ${JSON.stringify(safeLog)}`);
}
