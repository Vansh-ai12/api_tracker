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
  console.log("Updating Pro plan status for vj2754108@gmail.com...");

  // 1. Update users where gmail_email is vj2754108@gmail.com
  const { data: updatedByGmail, error: err1 } = await supabase
    .from("users")
    .update({ plan: "pro" })
    .ilike("gmail_email", "vj2754108@gmail.com")
    .select("id, gmail_email, plan");

  if (err1) console.error("Error updating by gmail_email:", err1);
  else console.log("Updated users by gmail_email:", updatedByGmail);

  // 2. Find auth users with email vj2754108@gmail.com
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const matchedAuthUser = authUsers?.users?.find(
    (u) => u.email?.toLowerCase() === "vj2754108@gmail.com"
  );

  if (matchedAuthUser) {
    const { data: updatedByAuth, error: err2 } = await supabase
      .from("users")
      .update({ plan: "pro" })
      .eq("auth_user_id", matchedAuthUser.id)
      .select("id, plan");

    if (err2) console.error("Error updating by auth_user_id:", err2);
    else console.log("Updated users by auth_user_id:", updatedByAuth);
  }

  // 3. Update all current users in database to Pro so dev environment is Pro enabled for current test user
  const { data: allUsers } = await supabase.from("users").select("id, forwarding_alias, plan");
  console.log("Current users in DB:", allUsers);

  if (allUsers && allUsers.length > 0) {
    for (const u of allUsers) {
      await supabase.from("users").update({ plan: "pro" }).eq("id", u.id);
      console.log(`Granted Pro plan to user ${u.id} (${u.forwarding_alias})`);
    }
  }
}

main().catch(console.error);
