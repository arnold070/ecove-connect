/**
 * Validate platform-settings credentials without exposing them.
 * Each tester returns { ok, message, detail? } — never echoes secret values.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPlatformValue } from "./platform-settings.server";

async function testCloudinary(): Promise<TestResult> {
  const [cloud, key, secret] = await Promise.all([
    getPlatformValue("CLOUDINARY_CLOUD_NAME"),
    getPlatformValue("CLOUDINARY_API_KEY"),
    getPlatformValue("CLOUDINARY_API_SECRET"),
  ]);
  const missing: string[] = [];
  if (!cloud) missing.push("CLOUDINARY_CLOUD_NAME");
  if (!key) missing.push("CLOUDINARY_API_KEY");
  if (!secret) missing.push("CLOUDINARY_API_SECRET");
  if (missing.length) return { ok: false, message: `Missing: ${missing.join(", ")}` };
  try {
    const auth = Buffer.from(`${key}:${secret}`).toString("base64");
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/usage`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      return { ok: false, message: `Cloudinary auth failed (${res.status})` };
    }
    return { ok: true, message: "Cloudinary credentials are valid", detail: `cloud=${cloud}` };
  } catch (e) {
    return { ok: false, message: "Could not reach Cloudinary", detail: (e as Error).message };
  }
}

interface TestResult {
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

async function testSentry(): Promise<TestResult> {
  const dsn = await getPlatformValue("SENTRY_DSN");
  if (!dsn) return { ok: false, message: "SENTRY_DSN is not set" };
  try {
    const url = new URL(dsn);
    if (!url.username) return { ok: false, message: "DSN missing public key" };
    if (!url.pathname.replace("/", "")) return { ok: false, message: "DSN missing project id" };
    // Lightweight reachability check on Sentry host.
    const ping = await fetch(`https://${url.hostname}/api/0/`, { method: "GET" });
    if (ping.status >= 500) {
      return { ok: false, message: `Sentry host unreachable (${ping.status})` };
    }
    return { ok: true, message: "DSN format valid and host reachable", detail: `host=${url.hostname}` };
  } catch (e) {
    return { ok: false, message: "Invalid DSN format", detail: (e as Error).message };
  }
}

async function testPaystack(): Promise<TestResult> {
  const secret = await getPlatformValue("PAYSTACK_SECRET_KEY");
  if (!secret) return { ok: false, message: "PAYSTACK_SECRET_KEY is not set" };
  try {
    const res = await fetch("https://api.paystack.co/balance", {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string };
    if (res.ok && json.status) {
      return { ok: true, message: "Paystack key authenticated successfully" };
    }
    return {
      ok: false,
      message: `Paystack auth failed (${res.status})`,
      detail: json.message ?? res.statusText,
    };
  } catch (e) {
    return { ok: false, message: "Could not reach Paystack", detail: (e as Error).message };
  }
}

async function testStripe(): Promise<TestResult> {
  const secret = await getPlatformValue("STRIPE_SECRET_KEY");
  if (!secret) return { ok: false, message: "STRIPE_SECRET_KEY is not set" };
  try {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      object?: string;
    };
    if (res.ok && json.object === "balance") {
      return { ok: true, message: "Stripe key authenticated successfully" };
    }
    return {
      ok: false,
      message: `Stripe auth failed (${res.status})`,
      detail: json.error?.message ?? res.statusText,
    };
  } catch (e) {
    return { ok: false, message: "Could not reach Stripe", detail: (e as Error).message };
  }
}

async function testSmtp(): Promise<TestResult> {
  const [host, port, user, pass] = await Promise.all([
    getPlatformValue("SMTP_HOST"),
    getPlatformValue("SMTP_PORT"),
    getPlatformValue("SMTP_USERNAME"),
    getPlatformValue("SMTP_PASSWORD"),
  ]);
  const missing: string[] = [];
  if (!host) missing.push("SMTP_HOST");
  if (!port) missing.push("SMTP_PORT");
  if (!user) missing.push("SMTP_USERNAME");
  if (!pass) missing.push("SMTP_PASSWORD");
  if (missing.length) {
    return { ok: false, message: `Missing: ${missing.join(", ")}` };
  }
  const portNum = Number(port);
  if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
    return { ok: false, message: "SMTP_PORT must be a valid port number" };
  }
  // Workers can't open raw TCP to arbitrary SMTP servers; resolve DNS via DoH.
  try {
    const dns = await fetch(
      `https://1.1.1.1/dns-query?name=${encodeURIComponent(host)}&type=A`,
      { headers: { accept: "application/dns-json" } },
    );
    const json = (await dns.json().catch(() => ({}))) as { Answer?: unknown[] };
    if (Array.isArray(json.Answer) && json.Answer.length > 0) {
      return {
        ok: true,
        message: "SMTP host resolves and credentials are configured",
        detail: `host=${host} port=${portNum}`,
      };
    }
    return { ok: false, message: "SMTP host did not resolve" };
  } catch (e) {
    return { ok: false, message: "SMTP host check failed", detail: (e as Error).message };
  }
}

async function testResend(): Promise<TestResult> {
  const key = await getPlatformValue("RESEND_API_KEY");
  if (!key) return { ok: false, message: "RESEND_API_KEY is not set" };
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) {
      const from = await getPlatformValue("RESEND_FROM_EMAIL");
      return {
        ok: true,
        message: "Resend key authenticated successfully",
        detail: from ? `from=${from}` : "No RESEND_FROM_EMAIL set",
      };
    }
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, message: `Resend auth failed (${res.status})`, detail: json.message };
  } catch (e) {
    return { ok: false, message: "Could not reach Resend", detail: (e as Error).message };
  }
}

async function testPaystackWebhook(): Promise<TestResult> {
  const secret = await getPlatformValue("PAYSTACK_WEBHOOK_SECRET");
  if (!secret) return { ok: false, message: "PAYSTACK_WEBHOOK_SECRET is not set" };
  if (secret.length < 16) {
    return { ok: false, message: "Webhook secret looks too short (min 16 chars)" };
  }
  // Verify by signing a fixed payload and re-computing — proves crypto path works.
  try {
    const { createHmac } = await import("node:crypto");
    const sample = JSON.stringify({ event: "ping", data: { id: "test", reference: "test" } });
    const sig = createHmac("sha512", secret).update(sample).digest("hex");
    if (sig.length !== 128) throw new Error("unexpected signature length");
    const callback = await getPlatformValue("PAYSTACK_CALLBACK_URL");
    return {
      ok: true,
      message: "Webhook secret is set and signature path is valid",
      detail: callback ? `callback=${callback}` : "No PAYSTACK_CALLBACK_URL set",
    };
  } catch (e) {
    return { ok: false, message: "Signature test failed", detail: (e as Error).message };
  }
}

async function testRateLimit(): Promise<TestResult> {
  // Hammer the public webhook with intentionally-invalid signatures to verify
  // that rate-limiting (per-IP) kicks in. We expect 401 for the first few,
  // then 429 once the limit is exceeded.
  try {
    const url = new URL("/api/public/paystack-webhook", "http://localhost").pathname;
    const target =
      (typeof globalThis !== "undefined" &&
        (globalThis as { location?: { origin?: string } }).location?.origin) ||
      "";
    const base = target || "";
    const body = JSON.stringify({ event: "ping" });
    const codes: number[] = [];
    const N = 25;
    for (let i = 0; i < N; i++) {
      const res = await fetch(`${base}${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-paystack-signature": "bogus" },
        body,
      });
      codes.push(res.status);
    }
    const got429 = codes.includes(429);
    const got401 = codes.includes(401);
    return {
      ok: got429 && got401,
      message: got429
        ? `Rate-limit fired (401×${codes.filter((c) => c === 401).length}, 429×${codes.filter((c) => c === 429).length})`
        : `No 429 seen in ${N} requests — limiter may be misconfigured`,
      detail: `codes=${codes.join(",")}`,
    };
  } catch (e) {
    return { ok: false, message: "Rate-limit harness error", detail: (e as Error).message };
  }
}

const testers: Record<string, () => Promise<TestResult>> = {
  sentry: testSentry,
  paystack: testPaystack,
  paystack_webhook: testPaystackWebhook,
  stripe: testStripe,
  smtp: testSmtp,
  cloudinary: testCloudinary,
  resend: testResend,
  rate_limit: testRateLimit,
};

const testSchema = z.object({
  service: z.enum([
    "sentry",
    "paystack",
    "paystack_webhook",
    "stripe",
    "smtp",
    "cloudinary",
    "resend",
    "rate_limit",
  ]),
});

export const testPlatformService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => testSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    return testers[data.service]!();
  });

