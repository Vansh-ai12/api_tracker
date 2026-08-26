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
  | "gmail_token_refresh_failed"
  | "private_mode_enabled"
  | "email_webhook_received"
  | "email_webhook_failed"
  | "cron_gmail_scan_completed"
  | "cron_gmail_scan_failed"
  | "api_gmail_message_list"
  | "api_gmail_message_get"
  | "api_gmail_token_refresh"
  | "api_ai_parse"
  | "api_telegram_send";

export function logAuditEvent(
  event: AuditEventType,
  metadata?: {
    userId?: string;
    telegramChatId?: number;
    emailDomain?: string;
    subscriptionCount?: number;
    error?: string;
    apiStatus?: number;
    apiOperation?: string;
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
    apiStatus: metadata?.apiStatus || null,
    apiOperation: metadata?.apiOperation || null,
  };

  console.log(`[AUDIT] ${JSON.stringify(safeLog)}`);
}
