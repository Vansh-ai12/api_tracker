import { cookies } from "next/headers";
import { createServiceClient } from "./supabase-server";

/**
 * Reads the `unsub_session` HTTP-only cookie and resolves it to a Supabase
 * user UUID. Returns null if the cookie is absent, expired, or invalid.
 *
 * Safe to call from Server Components and Route Handlers.
 * Never trust user_id values supplied by the client.
 */
export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("unsub_session")?.value;

  if (!sessionToken) {
    return null;
  }

  const supabase = createServiceClient();

  const { data: session, error } = await supabase
    .from("web_sessions")
    .select("user_id, telegram_chat_id, expires_at, verified")
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (error || !session) {
    return null;
  }

  // Session must be verified.
  if (!session.verified) {
    return null;
  }

  // Session must not be expired.
  if (!session.expires_at || new Date(session.expires_at) <= new Date()) {
    return null;
  }

  /*
   * IMPORTANT:
   * For normal website login, web_sessions.user_id is the canonical
   * users.id. Return it directly.
   *
   * Do NOT create a user here.
   * Do NOT look up Gmail.
   * Do NOT create a Telegram user.
   */
  if (session.user_id) {
    return session.user_id;
  }

  /*
   * Legacy Telegram-only sessions.
   * Keep this only for old sessions that don't have user_id.
   */
  if (session.telegram_chat_id == null) {
    return null;
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("telegram_chat_id", session.telegram_chat_id)
    .maybeSingle();

  if (userError || !user) {
    return null;
  }

  return user.id;
}

export type UserPlan = "free" | "pro";

const PRO_ADMIN_EMAIL = "vj2754108@gmail.com";

/**
 * Retrieves the subscription plan ('free' | 'pro') for a user.
 * Grants 'pro' if user has purchased Pro (plan === 'pro') or matches admin account vj2754108@gmail.com.
 * Defaults to 'free' for all other un-upgraded users.
 */
export async function getUserPlan(userId: string): Promise<UserPlan> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("plan, gmail_email, auth_user_id")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return "free";
  }

  if (data.plan === "pro") return "pro";

  // Check if connected Gmail email or Auth email is the admin email
  if (data.gmail_email?.toLowerCase() === PRO_ADMIN_EMAIL.toLowerCase()) {
    // Auto-update DB for consistency
    await supabase.from("users").update({ plan: "pro" }).eq("id", userId);
    return "pro";
  }

  if (data.auth_user_id) {
    const { data: authUser } = await supabase.auth.admin.getUserById(data.auth_user_id);
    if (authUser?.user?.email?.toLowerCase() === PRO_ADMIN_EMAIL.toLowerCase()) {
      await supabase.from("users").update({ plan: "pro" }).eq("id", userId);
      return "pro";
    }
  }

  return "free";
}

/**
 * Retrieves profile info (plan, forwarding_alias) for a user.
 */
export async function getUserProfile(userId: string): Promise<{ plan: UserPlan; forwardingAlias: string }> {
  const plan = await getUserPlan(userId);
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("users")
    .select("forwarding_alias")
    .eq("id", userId)
    .maybeSingle();

  return {
    plan,
    forwardingAlias: data?.forwarding_alias || "my-receipts",
  };
}


