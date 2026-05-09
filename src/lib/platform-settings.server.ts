/**
 * Runtime reader for platform_settings. Reads values from the database
 * at runtime (with a short in-memory cache) so admins can rotate keys
 * via the dashboard without redeploying. Falls back to process.env when
 * the DB row is empty.
 *
 * SERVER-ONLY. Do not import from client code.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TTL_MS = 30_000;
const cache = new Map<string, { value: string; expiresAt: number }>();

export async function getPlatformValue(key: string): Promise<string> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  let value = "";
  try {
    const { data } = await supabaseAdmin
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    value = (data?.value as string | undefined) ?? "";
  } catch {
    /* fall through to env */
  }

  if (!value) value = process.env[key] ?? "";

  cache.set(key, { value, expiresAt: now + TTL_MS });
  return value;
}

export function invalidatePlatformValue(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}
