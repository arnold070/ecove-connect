// Browser Supabase client. Safe to import in components.
// Uses the publishable (anon) key — RLS applies.
//
// IMPORTANT: Construct LAZILY via a Proxy. If we built the real client at
// module scope and the env vars were empty (e.g. the preview build was
// produced without ECOVE_SUPABASE_* in the build environment), createClient
// throws "supabaseUrl is required" during SSR and EVERY route 500s.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

function readEnv(name: string): string {
  // Vite inlines `import.meta.env.VITE_*` at build time.
  const fromVite =
    (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
      .env?.[name] ?? "";
  if (fromVite) return fromVite;
  // SSR runtime fallback (Cloudflare Worker env is exposed via process.env
  // when nodejs_compat is on).
  if (typeof process !== "undefined" && process.env) {
    if (name === "VITE_PUBLIC_SUPABASE_URL") {
      return (
        process.env.ECOVE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ""
      );
    }
    if (name === "VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY") {
      return (
        process.env.ECOVE_SUPABASE_PUBLISHABLE_KEY ??
        process.env.SUPABASE_PUBLISHABLE_KEY ??
        ""
      );
    }
  }
  return "";
}

let cached: SupabaseClient<Database> | undefined;

function getClient(): SupabaseClient<Database> {
  if (cached) return cached;
  const url = readEnv("VITE_PUBLIC_SUPABASE_URL");
  const key = readEnv("VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) {
    // eslint-disable-next-line no-console
    console.warn(
      "[ecove] Supabase env vars missing at runtime. Auth/data calls will fail until ECOVE_SUPABASE_URL and ECOVE_SUPABASE_PUBLISHABLE_KEY are set in the build/runtime environment.",
    );
    throw new Error(
      "[ecove] Supabase client not configured (missing URL or publishable key).",
    );
  }
  cached = createClient<Database>(url, key, {
    auth: {
      storage:
        typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cached;
}

// Proxy preserves the `supabase.from(...)` import shape while deferring
// client construction until the first property access. This means importing
// this module from server code (SSR) does NOT throw even if env vars are
// missing — only the actual call site will throw.
export const supabase: SupabaseClient<Database> = new Proxy(
  {} as SupabaseClient<Database>,
  {
    get(_target, prop, receiver) {
      const client = getClient();
      const value = Reflect.get(client as object, prop, receiver);
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
);
