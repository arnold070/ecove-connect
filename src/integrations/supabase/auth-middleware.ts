/**
 * Auth middleware for server functions.
 * Validates the bearer token from the request and provides an authenticated
 * Supabase client scoped to the current user.
 */
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

export const requireSupabaseAuth = createMiddleware().server(async ({ next }) => {
  const url = process.env.ECOVE_SUPABASE_URL ?? "";
  const anonKey = process.env.ECOVE_SUPABASE_PUBLISHABLE_KEY ?? "";

  if (!url || !anonKey) {
    throw new Response("Server misconfigured", { status: 500 } as ResponseInit);
  }

  const authHeader = getRequestHeader("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    throw new Response("Unauthorized", { status: 401 } as ResponseInit);
  }

  const supabase = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Response("Unauthorized", { status: 401 } as ResponseInit);
  }

  return next({
    context: {
      supabase,
      userId: user.id,
      claims: user.app_metadata ?? {},
    },
  });
});
