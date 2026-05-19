/**
 * Production-readiness checks. Read-only — never mutates DB or settings.
 * Each check returns { ok, message, detail? } so the admin UI can list them.
 *
 * Bundled into the existing platform-tests pattern so the admin can run them
 * one by one or all-at-once from /admin/readiness.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPlatformValue } from "./platform-settings.server";

export interface ReadinessItem {
  id: string;
  label: string;
  category: "secrets" | "database" | "storage" | "auth" | "config";
  ok: boolean;
  message: string;
  detail?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

const REQUIRED_SECRETS: Array<{ key: string; label: string }> = [
  { key: "PAYSTACK_PUBLIC_KEY", label: "Paystack public key" },
  { key: "PAYSTACK_SECRET_KEY", label: "Paystack secret key" },
  { key: "PAYSTACK_WEBHOOK_SECRET", label: "Paystack webhook secret" },
  { key: "PAYSTACK_CALLBACK_URL", label: "Paystack callback URL" },
  { key: "RESEND_API_KEY", label: "Resend API key" },
  { key: "RESEND_FROM_EMAIL", label: "Resend From address" },
  { key: "PLATFORM_COMMISSION_BPS", label: "Platform commission (bps)" },
];

const REQUIRED_BUCKETS = ["product-images", "vendor-logos", "kyc-documents"];

async function checkSecrets(): Promise<ReadinessItem[]> {
  const items: ReadinessItem[] = [];
  for (const s of REQUIRED_SECRETS) {
    const v = await getPlatformValue(s.key);
    items.push({
      id: `secret:${s.key}`,
      label: s.label,
      category: "secrets",
      ok: !!v,
      message: v ? "Configured" : "Missing — set in /admin/settings",
      detail: v ? `length=${v.length}` : undefined,
    });
  }
  // Paystack live-mode check
  const sk = await getPlatformValue("PAYSTACK_SECRET_KEY");
  if (sk) {
    const isLive = sk.startsWith("sk_live_");
    items.push({
      id: "config:paystack_live",
      label: "Paystack live keys",
      category: "config",
      ok: isLive,
      message: isLive ? "Using live keys" : "Test keys detected — swap to sk_live_ before launch",
    });
  }
  return items;
}

async function checkAdminUser(): Promise<ReadinessItem> {
  const { count, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "admin");
  if (error) {
    return {
      id: "auth:admin_exists",
      label: "At least one admin account",
      category: "auth",
      ok: false,
      message: error.message,
    };
  }
  const n = count ?? 0;
  return {
    id: "auth:admin_exists",
    label: "At least one admin account",
    category: "auth",
    ok: n > 0,
    message: n > 0 ? `${n} admin(s) configured` : "No admin role assigned — privilege escalation risk",
  };
}

async function checkBuckets(): Promise<ReadinessItem[]> {
  const { data, error } = await supabaseAdmin.storage.listBuckets();
  const names = new Set((data ?? []).map((b: { name: string }) => b.name));
  return REQUIRED_BUCKETS.map((name) => ({
    id: `storage:${name}`,
    label: `Bucket: ${name}`,
    category: "storage" as const,
    ok: !error && names.has(name),
    message: names.has(name) ? "Exists" : "Missing — create in Storage",
  }));
}

async function checkApprovedProducts(): Promise<ReadinessItem> {
  const { count } = await supabaseAdmin
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");
  const n = count ?? 0;
  return {
    id: "database:approved_products",
    label: "Approved products available to buyers",
    category: "database",
    ok: n > 0,
    message: n > 0 ? `${n} live products` : "Storefront will be empty — approve products first",
  };
}

async function checkApprovedVendors(): Promise<ReadinessItem> {
  const { count } = await supabaseAdmin
    .from("vendors")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");
  const n = count ?? 0;
  return {
    id: "database:approved_vendors",
    label: "Approved vendors",
    category: "database",
    ok: n > 0,
    message: n > 0 ? `${n} approved` : "No approved vendors — KYC review pending",
  };
}

async function checkRateLimitFn(): Promise<ReadinessItem> {
  const { error } = await supabaseAdmin.rpc("bump_rate_limit", {
    _key: `readiness-probe-${Date.now()}`,
    _window_seconds: 1,
  });
  return {
    id: "database:rate_limit_fn",
    label: "Rate-limit RPC (bump_rate_limit)",
    category: "database",
    ok: !error,
    message: error ? error.message : "Available",
  };
}

async function checkRefundEnum(): Promise<ReadinessItem> {
  // 0011 migration adds the 'cancelled' status to refund_request_status.
  const { data, error } = await supabaseAdmin
    .from("refund_requests")
    .select("status")
    .eq("status", "cancelled")
    .limit(1);
  if (error && /invalid input value for enum/i.test(error.message)) {
    return {
      id: "database:refund_cancelled_enum",
      label: "Migration 0011 (refund cancelled status)",
      category: "database",
      ok: false,
      message: "Pending — run db/0011_refund_status_cancelled.sql",
    };
  }
  return {
    id: "database:refund_cancelled_enum",
    label: "Migration 0011 (refund cancelled status)",
    category: "database",
    ok: true,
    message: data ? "Applied" : "Applied (no cancelled rows yet)",
  };
}

export const runReadinessChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReadinessItem[]> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const results: ReadinessItem[] = [];

    const settled = await Promise.allSettled([
      checkSecrets(),
      checkAdminUser(),
      checkBuckets(),
      checkApprovedProducts(),
      checkApprovedVendors(),
      checkRateLimitFn(),
      checkRefundEnum(),
    ]);

    for (const r of settled) {
      if (r.status === "fulfilled") {
        results.push(...(Array.isArray(r.value) ? r.value : [r.value]));
      } else {
        results.push({
          id: `error:${Math.random().toString(36).slice(2, 8)}`,
          label: "Check failed",
          category: "config",
          ok: false,
          message: r.reason?.message ?? "Unknown error",
        });
      }
    }

    return results;
  });
