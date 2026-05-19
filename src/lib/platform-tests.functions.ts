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

const testers: Record<string, () => Promise<TestResult>> = {
  sentry: testSentry,
  paystack: testPaystack,
  stripe: testStripe,
  smtp: testSmtp,
};

const testSchema = z.object({
  service: z.enum(["sentry", "paystack", "stripe", "smtp"]),
});

export const testPlatformService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => testSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    return testers[data.service]!();
  });
