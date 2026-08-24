import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, "utf-8");
    for (const line of envConfig.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...valueParts] = trimmed.split("=");
        process.env[key.trim()] = valueParts.join("=").trim();
      }
    }
  }
}

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("=== Inspecting Current Users in Database ===");

  const { data: users, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching users:", error);
    return;
  }

  console.log(`Found ${users?.length || 0} user records:`);
  users?.forEach((u, i) => {
    console.log(`[${i}] ID: ${u.id}`);
    console.log(`    auth_user_id: ${u.auth_user_id}`);
    console.log(`    telegram_chat_id: ${u.telegram_chat_id}`);
    console.log(`    gmail_email: ${u.gmail_email}`);
    console.log(`    gmail_connected: ${u.gmail_connected}`);
    console.log(`    tracking_mode: ${u.tracking_mode}`);
    console.log(`    forwarding_alias: ${u.forwarding_alias}`);
    console.log(`    plan: ${u.plan}`);
    console.log(`    created_at: ${u.created_at}`);
  });

  const telegramUser = users?.find((u) => u.telegram_chat_id !== null || u.gmail_connected);
  const webAuthUser = users?.find((u) => u.auth_user_id !== null && u.id !== telegramUser?.id);

  if (telegramUser && webAuthUser) {
    const authUserId = webAuthUser.auth_user_id;

    console.log(`\nReconciling Web user (${webAuthUser.id}) into canonical Telegram/Gmail user (${telegramUser.id})...`);

    // 1. Point web_sessions from webAuthUser to telegramUser
    await supabase
      .from("web_sessions")
      .update({ user_id: telegramUser.id })
      .eq("user_id", webAuthUser.id);

    // 2. Point any subscriptions or evidence to telegramUser
    await supabase
      .from("subscriptions")
      .update({ user_id: telegramUser.id })
      .eq("user_id", webAuthUser.id);

    await supabase
      .from("subscription_evidence")
      .update({ user_id: telegramUser.id })
      .eq("user_id", webAuthUser.id);

    await supabase
      .from("usage_reports")
      .update({ user_id: telegramUser.id })
      .eq("user_id", webAuthUser.id);

    await supabase
      .from("raw_emails")
      .update({ user_id: telegramUser.id })
      .eq("user_id", webAuthUser.id);

    // 3. Clear auth_user_id from the duplicate web row first
    await supabase
      .from("users")
      .update({ auth_user_id: null })
      .eq("id", webAuthUser.id);

    // 4. Attach auth_user_id to the canonical telegramUser row
    const { error: updateErr } = await supabase
      .from("users")
      .update({
        auth_user_id: authUserId,
        plan: "pro",
        updated_at: new Date().toISOString(),
      })
      .eq("id", telegramUser.id);

    if (updateErr) {
      console.error("Error updating canonical user with auth_user_id:", updateErr);
      return;
    }

    // 5. Delete the duplicate web user row
    const { error: delErr } = await supabase
      .from("users")
      .delete()
      .eq("id", webAuthUser.id);

    if (delErr) {
      console.error("Error deleting duplicate web user row:", delErr);
    } else {
      console.log("✅ Successfully merged into ONE canonical row and deleted duplicate web row!");
    }
  }

  // Verify final state
  const { data: finalUsers } = await supabase.from("users").select("*");
  console.log("\n=== FINAL USERS IN DATABASE ===");
  finalUsers?.forEach((u, i) => {
    console.log(`[${i}] ID: ${u.id}`);
    console.log(`    auth_user_id: ${u.auth_user_id}`);
    console.log(`    telegram_chat_id: ${u.telegram_chat_id}`);
    console.log(`    gmail_email: ${u.gmail_email}`);
    console.log(`    gmail_connected: ${u.gmail_connected}`);
    console.log(`    tracking_mode: ${u.tracking_mode}`);
    console.log(`    forwarding_alias: ${u.forwarding_alias}`);
    console.log(`    plan: ${u.plan}`);
  });
}

main().catch(console.error);
