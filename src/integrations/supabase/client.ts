// Browser Supabase client. Safe to import in components.
// Uses the publishable (anon) key — RLS applies.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Loosely-typed Database. Replace with `supabase gen types` output once the schema is live.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env
  .VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  // Surface a clear error during dev rather than a cryptic 401 at runtime.
  // eslint-disable-next-line no-console
  console.warn(
    "[ecove] Supabase env vars missing. Did you set ECOVE_SUPABASE_URL and ECOVE_SUPABASE_PUBLISHABLE_KEY?",
  );
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
