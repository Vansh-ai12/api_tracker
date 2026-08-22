import webpush from "web-push";
import { createServiceClient } from "./supabase-server";

// Configure VAPID once at module load time.
webpush.setVapidDetails(
  "mailto:hello@unsub.app",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Sends a Web Push notification to all registered browser devices for a user.
 *
 * - Silently skips users with no push subscriptions.
 * - Automatically deletes any subscription that returns HTTP 404 or 410
 *   (expired / unregistered by the browser).
 * - Other errors are logged but do NOT throw — callers must never fail
 *   because of a push error.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  const supabase = createServiceClient();

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    console.error("[push] Failed to fetch subscriptions for user", userId, error);
    return;
  }

  if (!subs || subs.length === 0) return;

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;

        if (status === 410 || status === 404) {
          // Subscription expired or unregistered — clean it up.
          const { error: delError } = await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", sub.id);

          if (delError) {
            console.error(
              "[push] Failed to delete stale subscription",
              sub.id,
              delError,
            );
          } else {
            console.log("[push] Removed stale subscription", sub.id);
          }
        } else {
          console.error(
            "[push] Unexpected error sending to sub",
            sub.id,
            err,
          );
        }
      }
    }),
  );
}
