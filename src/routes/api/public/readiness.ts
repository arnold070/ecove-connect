/**
 * Public, token-protected readiness probe for CI/CD deploy gates.
 *
 * Reads platform_settings + key tables WITHOUT a user session and returns
 * a JSON pass/fail summary. Protect with a shared secret so external
 * callers can hit it from GitHub Actions / Hestia post-build hooks
 * without going through the admin UI.
 *
 * Required header: `x-readiness-token: <READINESS_PROBE_TOKEN>`
 *   - Set via /admin/settings -> platform_settings, OR
 *   - process.env.READINESS_PROBE_TOKEN
 *
 * Response codes:
 *   200  – all required checks pass
 *   424  – one or more blockers (CI should fail)
 *   401  – bad/missing token
 *   500  – probe itself errored
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPlatformValue } from "@/lib/platform-settings.server";

interface Check {
  id: string;
  ok: boolean;
  message: string;
}

const REQUIRED_SECRETS = [
  "PAYSTACK_PUBLIC_KEY",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
];

async function runProbe(): Promise<{ checks: Check[]; blockers: number }> {
  const checks: Check[] = [];

  for (const k of REQUIRED_SECRETS) {
    const v = await getPlatformValue(k);
    checks.push({ id: `secret:${k}`, ok: !!v, message: v ? "configured" : "missing" });
  }

  const sk = await getPlatformValue("PAYSTACK_SECRET_KEY");
  checks.push({
    id: "config:paystack_live",
    ok: !!sk && sk.startsWith("sk_live_"),
    message: sk?.startsWith("sk_live_") ? "live keys" : "test keys (must be sk_live_ for prod)",
  });

  const { count: adminCount } = await supabaseAdmin
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "admin");
  checks.push({
    id: "auth:admin_exists",
    ok: (adminCount ?? 0) > 0,
    message: `${adminCount ?? 0} admin(s)`,
  });

  const { data: bucketList } = await supabaseAdmin.storage.listBuckets();
  const names = new Set((bucketList ?? []).map((b: { name: string }) => b.name));
  for (const b of ["product-images", "vendor-logos", "kyc-documents"]) {
    checks.push({ id: `storage:${b}`, ok: names.has(b), message: names.has(b) ? "exists" : "missing" });
  }

  // Migration 0011 (refund cancelled enum)
  const refund = await supabaseAdmin
    .from("refund_requests")
    .select("status")
    .eq("status", "cancelled")
    .limit(1);
  const enumOk = !(refund.error && /invalid input value for enum/i.test(refund.error.message));
  checks.push({
    id: "db:migration_0011",
    ok: enumOk,
    message: enumOk ? "applied" : "pending — run db/0011_refund_status_cancelled.sql",
  });

  const blockers = checks.filter((c) => !c.ok).length;
  return { checks, blockers };
}

export const Route = createFileRoute("/api/public/readiness")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const expected =
          (await getPlatformValue("READINESS_PROBE_TOKEN")) ||
          process.env.READINESS_PROBE_TOKEN ||
          "";
        if (!expected) {
          return Response.json(
            { ok: false, error: "READINESS_PROBE_TOKEN not configured" },
            { status: 500 },
          );
        }
        const provided = request.headers.get("x-readiness-token") ?? "";
        let authed = false;
        try {
          const a = Buffer.from(expected);
          const b = Buffer.from(provided);
          authed = a.length === b.length && timingSafeEqual(a, b);
        } catch {
          authed = false;
        }
        if (!authed) return new Response("Unauthorized", { status: 401 });

        try {
          const { checks, blockers } = await runProbe();
          return Response.json(
            {
              ok: blockers === 0,
              blockers,
              total: checks.length,
              checks,
              checked_at: new Date().toISOString(),
            },
            { status: blockers === 0 ? 200 : 424 },
          );
        } catch (e) {
          return Response.json(
            { ok: false, error: (e as Error).message },
            { status: 500 },
          );
        }
      },
    },
  },
});
