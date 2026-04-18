// Server-only Supabase admin client. NEVER import this from client code.
// Uses the service role key and BYPASSES RLS.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = process.env.ECOVE_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.ECOVE_SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    "[ecove] Server Supabase env missing (ECOVE_SUPABASE_URL / ECOVE_SUPABASE_SERVICE_ROLE_KEY).",
  );
}

export const supabaseAdmin: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
