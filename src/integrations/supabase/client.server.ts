// Server-only Supabase admin client. NEVER import this from client code.
// Uses the service role key and BYPASSES RLS.
//
// IMPORTANT: On Cloudflare Workers, env vars are injected at REQUEST time,
// not at module load time. Constructing the client at module scope would
// throw "supabaseUrl is required" during SSR. We lazily build it on first use.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

let cached: SupabaseClient<Database> | undefined;

function getClient(): SupabaseClient<Database> {
  if (cached) return cached;
  const url = process.env.ECOVE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.ECOVE_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";
  if (!url || !key) {
    throw new Error(
      "[ecove] Server Supabase env missing (ECOVE_SUPABASE_URL / ECOVE_SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  cached = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

// Proxy preserves the `supabaseAdmin.foo(...)` import shape while deferring
// client construction until the first property access (i.e. request time).
export const supabaseAdmin: SupabaseClient<Database> = new Proxy(
  {} as SupabaseClient<Database>,
  {
    get(_target, prop, receiver) {
      const client = getClient();
      const value = Reflect.get(client as object, prop, receiver);
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
);
