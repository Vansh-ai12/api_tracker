import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, "utf-8");
    for (const line of envConfig.split("\n")) {
      const trimmed = line.trim().replace(/\r/g, "");
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...valueParts] = trimmed.split("=");
        process.env[key.trim()] = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("=== Inspecting Supabase Auth User & Public Users ===");
  const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById("7b75ce5f-5470-4971-9c92-e64b20791a7b");
  console.log("Auth user 7b75ce5f-5470-4971-9c92-e64b20791a7b:", authUser?.user?.email, authUser?.user?.id, authErr);

  const { data: allUsers } = await supabase.from("users").select("*");
  console.log("All public.users rows in DB:");
  allUsers?.forEach((u, i) => {
    console.log(`[${i}] id: ${u.id}`);
    console.log(`    auth_user_id: ${u.auth_user_id}`);
    console.log(`    telegram_chat_id: ${u.telegram_chat_id}`);
    console.log(`    gmail_email: ${u.gmail_email}`);
    console.log(`    forwarding_alias: ${u.forwarding_alias}`);
    console.log(`    tracking_mode: ${u.tracking_mode}`);
    console.log(`    created_at: ${u.created_at}`);
  });
}

main().catch(console.error);
