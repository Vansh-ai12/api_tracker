import { NextResponse } from "next/server";
import { getUserPlan } from "./session";
import { createServiceClient } from "./supabase-server";

export const FREE_SUBSCRIPTION_LIMIT = 2;

const PRO_FEATURE_BODY = {
  error: "Pro feature",
  message: "API usage tracking is available only on the Pro plan.",
} as const;

const SUBSCRIPTION_LIMIT_BODY = {
  error: "Subscription limit reached",
  message:
    "Free accounts can track up to 2 subscriptions. Upgrade to Pro for unlimited subscription tracking.",
} as const;

export async function isProUser(userId: string): Promise<boolean> {
  return (await getUserPlan(userId)) === "pro";
}

/**
 * Returns a 403 response if the user is not Pro, otherwise null.
 * Plan is always loaded from the database via getUserPlan — never from the client.
 */
export async function requireProUser(userId: string): Promise<NextResponse | null> {
  if (await isProUser(userId)) return null;
  return NextResponse.json(PRO_FEATURE_BODY, { status: 403 });
}

export function proFeatureForbidden(): NextResponse {
  return NextResponse.json(PRO_FEATURE_BODY, { status: 403 });
}

export function subscriptionLimitForbidden(): NextResponse {
  return NextResponse.json(SUBSCRIPTION_LIMIT_BODY, { status: 403 });
}

export async function countActiveSubscriptions(userId: string): Promise<number> {
  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    console.error("[plan] Failed to count active subscriptions:", error);
    return Number.MAX_SAFE_INTEGER;
  }

  return count ?? 0;
}

export async function canCreateTrackedSubscription(userId: string): Promise<boolean> {
  if (await isProUser(userId)) return true;
  return (await countActiveSubscriptions(userId)) < FREE_SUBSCRIPTION_LIMIT;
}

/**
 * Blocks Free users who already have the maximum number of active subscriptions.
 */
export async function requireSubscriptionSlot(
  userId: string,
): Promise<NextResponse | null> {
  if (await canCreateTrackedSubscription(userId)) return null;
  return subscriptionLimitForbidden();
}

/**
 * Closes a race where two concurrent Free creates both pass the pre-insert count.
 * If the user now exceeds the Free cap, deletes the newly inserted row and returns 403.
 */
export async function rollbackIfOverSubscriptionLimit(
  userId: string,
  newSubscriptionId: string,
): Promise<NextResponse | null> {
  if (await isProUser(userId)) return null;

  const count = await countActiveSubscriptions(userId);
  if (count <= FREE_SUBSCRIPTION_LIMIT) return null;

  const supabase = createServiceClient();
  await supabase
    .from("subscriptions")
    .delete()
    .eq("id", newSubscriptionId)
    .eq("user_id", userId);

  return subscriptionLimitForbidden();
}
