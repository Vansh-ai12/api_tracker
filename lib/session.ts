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

  if (!sessionToken) return null;

  const supabase = createServiceClient();

  // Find a verified, non-expired session with this token.
  const { data: session, error: sessionError } = await supabase
    .from("web_sessions")
    .select("user_id, telegram_chat_id, expires_at, verified")
    .eq("session_token", sessionToken)
    .single();

  if (sessionError || !session) return null;
  if (!session.verified) return null;
  if (new Date(session.expires_at) < new Date()) return null;

  // Email/password sessions contain the user ID directly. Keep the Telegram
  // lookup for existing OTP sessions created before normal sign-in was added.
  if (session.user_id) return session.user_id;

  if (session.telegram_chat_id === null) return null;

  // Resolve legacy telegram_chat_id -> user UUID.
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("telegram_chat_id", session.telegram_chat_id)
    .single();

  if (userError || !user) return null;

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


