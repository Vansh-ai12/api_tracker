import { createServiceClient } from "@/lib/supabase-server";

function generateAlias(length = 10): string {
  const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
}

export async function ensurePublicUserForAuth(authUserId: string): Promise<string> {
  const supabase = createServiceClient();
  const { data: existingUser, error: existingUserError } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (existingUserError) throw existingUserError;
  if (existingUser) return existingUser.id;

  for (let attempt = 0; attempt < 10; attempt++) {
    const alias = generateAlias();
    const { data: aliasOwner, error: aliasError } = await supabase
      .from("users")
      .select("id")
      .eq("forwarding_alias", alias)
      .maybeSingle();

    if (aliasError) throw aliasError;
    if (aliasOwner) continue;

    let { data: user, error: insertError } = await supabase
      .from("users")
      .insert({ auth_user_id: authUserId, forwarding_alias: alias, plan: "free" })
      .select("id")
      .single();

    // Fallback if 'plan' column does not exist yet in DB schema
    if (insertError && (insertError.code === "42703" || insertError.message?.includes("plan"))) {
      const fallbackResult = await supabase
        .from("users")
        .insert({ auth_user_id: authUserId, forwarding_alias: alias })
        .select("id")
        .single();
      user = fallbackResult.data;
      insertError = fallbackResult.error;
    }

    if (user) return user.id;
    if (insertError?.code === "23505") continue;
    throw insertError ?? new Error("Could not create a user record");
  }

  // A simultaneous first sign-in may have created the matching record.
  const { data: retryUser, error: retryError } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (retryError) throw retryError;
  if (retryUser) return retryUser.id;

  throw new Error("Could not create a unique forwarding alias");
}
