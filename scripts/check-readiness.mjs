#!/usr/bin/env node
/**
 * CI deploy gate.
 *
 * Hits the public readiness probe and exits non-zero if any required
 * check fails. Wire into your CI pipeline before the deploy step.
 *
 * Required env vars:
 *   PUBLIC_SITE_URL          — e.g. https://ecove.ng
 *   READINESS_PROBE_TOKEN    — same value stored in platform_settings
 *
 * Usage:
 *   node scripts/check-readiness.mjs
 */
const url = process.env.PUBLIC_SITE_URL;
const token = process.env.READINESS_PROBE_TOKEN;

if (!url || !token) {
  console.error("✗ PUBLIC_SITE_URL and READINESS_PROBE_TOKEN must be set");
  process.exit(2);
}

const target = `${url.replace(/\/$/, "")}/api/public/readiness`;
console.log(`→ Probing ${target}`);

const res = await fetch(target, {
  headers: { "x-readiness-token": token, accept: "application/json" },
});

let body;
try {
  body = await res.json();
} catch {
  console.error(`✗ Non-JSON response (status ${res.status})`);
  process.exit(1);
}

if (Array.isArray(body.checks)) {
  for (const c of body.checks) {
    console.log(`  ${c.ok ? "✓" : "✗"} ${c.id} — ${c.message}`);
  }
}

if (res.status === 200 && body.ok) {
  console.log(`✓ Production-ready (${body.total} checks passed)`);
  process.exit(0);
}

console.error(`✗ Deploy blocked: ${body.blockers ?? "?"} failing check(s)`);
process.exit(1);
