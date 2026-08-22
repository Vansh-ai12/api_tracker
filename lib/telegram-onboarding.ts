import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase-server";

export const ONBOARDING_COOKIE = "unsub_onboarding";

/**
 * Resolves the temporary browser-to-Telegram link. This cookie is not an
 * authenticated session; it only lets the login flow discover the chat that
 * just pressed /start.
 */
export async function getLinkedTelegramChatId(options?: {
  allowExpiredLink?: boolean;
}): Promise<number | null> {
  const cookieStore = await cookies();
  const linkToken = cookieStore.get(ONBOARDING_COOKIE)?.value;

  if (!linkToken) return null;

  const supabase = createServiceClient();
  let query = supabase
    .from("telegram_login_links")
    .select("telegram_chat_id, user_id, connected_at")
    .eq("link_token", linkToken);

  if (!options?.allowExpiredLink) {
    query = query.gt("expires_at", new Date().toISOString());
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("[telegram-onboarding] Failed to resolve link:", error);
    return null;
  }

  if (!data?.user_id || !data.connected_at || data.telegram_chat_id === null) {
    return null;
  }

  return data.telegram_chat_id;
}
