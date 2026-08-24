import { createServiceClient } from "@/lib/supabase-server";

function generateAlias(length = 6): string {
  const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
}

async function generateUniqueAlias(): Promise<string> {
  const supabase = createServiceClient();
  for (let attempt = 0; attempt < 10; attempt++) {
    const alias = generateAlias();
    const { data: aliasOwner } = await supabase
      .from("users")
      .select("id")
      .eq("forwarding_alias", alias)
      .maybeSingle();

    if (!aliasOwner) return alias;
  }
  throw new Error("Could not generate a unique forwarding alias");
}

export interface ResolveUserParams {
  authUserId?: string | null;
  telegramChatId?: number | null;
  gmailEmail?: string | null;
  userEmail?: string | null;
  telegramUsername?: string | null;
}

/**
 * Universal canonical user resolution engine.
 * Ensures ONE REAL HUMAN = ONE CANONICAL public.users ROW.
 */
export async function resolveCanonicalUser(params: ResolveUserParams) {
  const supabase = createServiceClient();
  const { authUserId, telegramChatId, gmailEmail, userEmail, telegramUsername } = params;

  let existingByAuth: any = null;
  let existingByTg: any = null;
  let existingByEmail: any = null;

  // 1. Search by auth_user_id
  if (authUserId) {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    existingByAuth = data;
  }

  // 2. Search by telegram_chat_id
  if (telegramChatId && typeof telegramChatId === "number" && telegramChatId > 0) {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_chat_id", telegramChatId)
      .maybeSingle();
    existingByTg = data;
  }

  // 3. Search by email (gmail_email)
  const lookupEmail = (gmailEmail || userEmail || "").toLowerCase().trim();
  if (lookupEmail) {
    const { data } = await supabase
      .from("users")
      .select("*")
      .ilike("gmail_email", lookupEmail)
      .maybeSingle();
    existingByEmail = data;
  }

  // Case A: Both auth row and telegram row exist as separate records -> Merge them immediately into ONE canonical row
  if (existingByAuth && existingByTg && existingByAuth.id !== existingByTg.id) {
    console.log(`[canonical-user] Merging separate auth row (${existingByAuth.id}) into Telegram row (${existingByTg.id})`);
    
    // Clear auth_user_id from auth row first to prevent unique key violation
    await supabase.from("users").update({ auth_user_id: null }).eq("id", existingByAuth.id);
    
    // Migrate dependent records
    await supabase.from("web_sessions").update({ user_id: existingByTg.id }).eq("user_id", existingByAuth.id);
    await supabase.from("subscriptions").update({ user_id: existingByTg.id }).eq("user_id", existingByAuth.id);
    await supabase.from("subscription_evidence").update({ user_id: existingByTg.id }).eq("user_id", existingByAuth.id);
    await supabase.from("usage_reports").update({ user_id: existingByTg.id }).eq("user_id", existingByAuth.id);
    await supabase.from("raw_emails").update({ user_id: existingByTg.id }).eq("user_id", existingByAuth.id);
    
    // Update canonical row with auth_user_id
    const { data: updatedCanonical } = await supabase
      .from("users")
      .update({
        auth_user_id: authUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingByTg.id)
      .select("*")
      .single();

    // Delete redundant row
    await supabase.from("users").delete().eq("id", existingByAuth.id);
    return updatedCanonical || existingByTg;
  }

  // Case B: Auth user exists, but Telegram identity needs to be linked
  if (existingByAuth) {
    if (telegramChatId && existingByAuth.telegram_chat_id !== telegramChatId) {
      const { data: updated } = await supabase
        .from("users")
        .update({
          telegram_chat_id: telegramChatId,
          telegram_username: telegramUsername || existingByAuth.telegram_username,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingByAuth.id)
        .select("*")
        .single();
      return updated || existingByAuth;
    }
    return existingByAuth;
  }

  // Case C: Telegram user exists, but Auth identity needs to be linked
  if (existingByTg) {
    if (authUserId && existingByTg.auth_user_id !== authUserId) {
      const { data: updated } = await supabase
        .from("users")
        .update({
          auth_user_id: authUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingByTg.id)
        .select("*")
        .single();
      return updated || existingByTg;
    }
    return existingByTg;
  }

  // Case D: Email matched an existing user row without auth_user_id or telegram_chat_id
  if (existingByEmail) {
    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
    let shouldUpdate = false;

    if (authUserId && !existingByEmail.auth_user_id) {
      updatePayload.auth_user_id = authUserId;
      shouldUpdate = true;
    }
    if (telegramChatId && !existingByEmail.telegram_chat_id) {
      updatePayload.telegram_chat_id = telegramChatId;
      updatePayload.telegram_username = telegramUsername || existingByEmail.telegram_username;
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      const { data: updated } = await supabase
        .from("users")
        .update(updatePayload)
        .eq("id", existingByEmail.id)
        .select("*")
        .single();
      return updated || existingByEmail;
    }
    return existingByEmail;
  }

  // Case E: No matching user found anywhere -> Insert EXACTLY ONE new canonical user row
  const alias = await generateUniqueAlias();
  const insertPayload: Record<string, any> = {
    forwarding_alias: alias,
    plan: "free",
    tracking_mode: "PRIVATE_EMAIL",
    gmail_connected: false,
  };

  if (authUserId) insertPayload.auth_user_id = authUserId;
  if (telegramChatId) {
    insertPayload.telegram_chat_id = telegramChatId;
    if (telegramUsername) insertPayload.telegram_username = telegramUsername;
  }

  const { data: newUser, error: insertErr } = await supabase
    .from("users")
    .insert(insertPayload)
    .select("*")
    .single();

  if (newUser) return newUser;

  if (insertErr) {
    console.error("[canonical-user] Insert error, checking fallback lookup:", insertErr);
    // If concurrent insert occurred, return existing row
    if (authUserId) {
      const { data: fallbackAuth } = await supabase.from("users").select("*").eq("auth_user_id", authUserId).maybeSingle();
      if (fallbackAuth) return fallbackAuth;
    }
    if (telegramChatId) {
      const { data: fallbackTg } = await supabase.from("users").select("*").eq("telegram_chat_id", telegramChatId).maybeSingle();
      if (fallbackTg) return fallbackTg;
    }
  }

  throw insertErr || new Error("Failed to create canonical user record");
}

/**
 * Ensures public user for web authentication sessions.
 */
export async function ensurePublicUserForAuth(authUserId: string, userEmail?: string): Promise<string> {
  const user = await resolveCanonicalUser({
    authUserId,
    userEmail,
  });
  return user.id;
}
