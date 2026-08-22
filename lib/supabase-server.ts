import { createClient } from "@supabase/supabase-js";

/**
 * Returns a Supabase service-role client for use in server-only code
 * (Route Handlers, Server Components, lib utilities).
 * Never expose SUPABASE_SERVICE_ROLE_KEY to the client bundle.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
