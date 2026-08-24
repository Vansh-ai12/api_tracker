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
  console.log("=== Inspecting & Reconciling Users ===");

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
    console.log(`    created_at: ${u.created_at}`);
  });

  // Reconcile user vj2754108@gmail.com if separate Telegram user and Auth user exist
  const authUser = users?.find((u) => u.auth_user_id !== null);
  const telegramGmailUser = users?.find((u) => u.auth_user_id === null && (u.telegram_chat_id !== null || u.gmail_connected));

  if (authUser && telegramGmailUser && authUser.id !== telegramGmailUser.id) {
    console.log(`\nReconciling Telegram/Gmail user (${telegramGmailUser.id}) into canonical Auth user (${authUser.id})...`);

    // 1. Migrate subscriptions
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("id, service_name")
      .eq("user_id", telegramGmailUser.id);

    console.log(`Found ${subs?.length || 0} subscriptions on Telegram user to migrate.`);
    if (subs && subs.length > 0) {
      for (const sub of subs) {
        // Check if canonical user already has this service
        const { data: existingCanonicalSub } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("user_id", authUser.id)
          .ilike("service_name", sub.service_name)
          .maybeSingle();

        if (existingCanonicalSub) {
          // Point evidence to existing canonical sub
          await supabase
            .from("subscription_evidence")
            .update({ subscription_id: existingCanonicalSub.id, user_id: authUser.id })
            .eq("subscription_id", sub.id);
          // Delete duplicate sub
          await supabase.from("subscriptions").delete().eq("id", sub.id);
        } else {
          await supabase
            .from("subscriptions")
            .update({ user_id: authUser.id })
            .eq("id", sub.id);
        }
      }
    }

    // 2. Migrate subscription evidence
    await supabase
      .from("subscription_evidence")
      .update({ user_id: authUser.id })
      .eq("user_id", telegramGmailUser.id);

    // 3. Migrate usage reports, raw emails, web sessions, oauth states
    await supabase
      .from("usage_reports")
      .update({ user_id: authUser.id })
      .eq("user_id", telegramGmailUser.id);

    await supabase
      .from("raw_emails")
      .update({ user_id: authUser.id })
      .eq("user_id", telegramGmailUser.id);

    await supabase
      .from("web_sessions")
      .update({ user_id: authUser.id })
      .eq("user_id", telegramGmailUser.id);

    await supabase
      .from("gmail_oauth_states")
      .update({ user_id: authUser.id })
      .eq("user_id", telegramGmailUser.id);

    // 4. Copy Gmail and Telegram state to canonical auth user
    const updatePayload: Record<string, any> = {
      telegram_chat_id: telegramGmailUser.telegram_chat_id || authUser.telegram_chat_id,
      telegram_username: telegramGmailUser.telegram_username || authUser.telegram_username,
      gmail_connected: telegramGmailUser.gmail_connected || authUser.gmail_connected,
      gmail_email: telegramGmailUser.gmail_email || authUser.gmail_email,
      gmail_refresh_token: telegramGmailUser.gmail_refresh_token || authUser.gmail_refresh_token,
      gmail_connected_at: telegramGmailUser.gmail_connected_at || authUser.gmail_connected_at,
      tracking_mode: telegramGmailUser.tracking_mode || authUser.tracking_mode || "GMAIL",
      plan: "pro",
    };

    const { error: updateAuthErr } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("id", authUser.id);

    if (updateAuthErr) {
      console.error("Error updating canonical user:", updateAuthErr);
      return;
    }

    // 5. Delete the orphan telegram user row
    const { error: deleteErr } = await supabase
      .from("users")
      .delete()
      .eq("id", telegramGmailUser.id);

    if (deleteErr) {
      console.error("Error deleting orphan user row:", deleteErr);
    } else {
      console.log("✅ Successfully merged and deleted orphan user row!");
    }
  }

  // Final check
  const { data: finalUsers } = await supabase.from("users").select("*");
  console.log("\n=== Final Users in Database ===");
  console.log(finalUsers);
}

main().catch(console.error);
