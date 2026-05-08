/**
 * Lightweight Sentry error reporter for Workers runtime.
 * Uses Sentry's HTTP API directly — no SDK needed.
 * Includes per-route rate limiting to avoid flooding.
 */

interface SentryEvent {
  event_id: string;
  timestamp: string;
  level: "error" | "fatal";
  platform: "node";
  server_name?: string;
  transaction?: string;
  tags: Record<string, string>;
  exception?: {
    values: Array<{
      type: string;
      value: string;
      stacktrace?: { frames: Array<{ filename: string; lineno?: number; function?: string }> };
    }>;
  };
  request?: {
    url: string;
    method: string;
    headers: Record<string, string>;
  };
}

// ---- Rate limiter: sliding window per route ----

const WINDOW_MS = 60_000; // 1 minute
const MAX_PER_WINDOW = 5; // max 5 reports per route per minute

const windowMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(routeKey: string): boolean {
  const now = Date.now();
  const entry = windowMap.get(routeKey);
  if (!entry || now >= entry.resetAt) {
    windowMap.set(routeKey, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (entry.count >= MAX_PER_WINDOW) return true;
  entry.count++;
  return false;
}

// ---- DSN parsing ----

interface ParsedDsn {
  publicKey: string;
  projectId: string;
  host: string;
}

function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace("/", "");
    const host = url.hostname;
    return { publicKey, projectId, host };
  } catch {
    return null;
  }
}

// ---- UUID v4 without crypto.randomUUID ----

function generateEventId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Set version 4 and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---- Parse stack trace ----

function parseStack(
  stack?: string,
): Array<{ filename: string; lineno?: number; function?: string }> {
  if (!stack) return [];
  return stack
    .split("\n")
    .slice(1, 11)
    .map((line) => {
      const match = line.match(/at\s+(.*?)\s+\(?(.*?):(\d+):\d+\)?/);
      if (match) {
        return { function: match[1], filename: match[2], lineno: Number(match[3]) };
      }
      return { filename: line.trim(), function: "<anonymous>" };
    });
}

// ---- Sensitive header redaction ----

const SENSITIVE_KEYS = /^(password|authorization|cookie|secret|token|x-api-key|x-connection-api-key)$/i;

function safeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = SENSITIVE_KEYS.test(key) ? "[Filtered]" : value;
  });
  return result;
}

// ---- Main export ----

export interface SentryReportResult {
  eventId: string;
  sent: boolean;
  rateLimited: boolean;
}

/**
 * Report an error to Sentry. Returns the Sentry event ID for display.
 * Non-blocking — fires and forgets. Never throws.
 */
export async function reportToSentry(
  request: Request,
  error: unknown,
  extras: { requestId: string; errorCode: string; statusCode?: number },
): Promise<SentryReportResult> {
  const eventId = generateEventId();
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    return { eventId, sent: false, rateLimited: false };
  }

  const parsed = parseDsn(dsn);
  if (!parsed) {
    console.warn("[sentry] invalid SENTRY_DSN format");
    return { eventId, sent: false, rateLimited: false };
  }

  // Rate limit by route path
  const routeKey = new URL(request.url).pathname;
  if (isRateLimited(routeKey)) {
    return { eventId, sent: false, rateLimited: true };
  }

  const err = error instanceof Error ? error : new Error(String(error));

  const event: SentryEvent = {
    event_id: eventId,
    timestamp: new Date().toISOString(),
    level: "error",
    platform: "node",
    transaction: routeKey,
    tags: {
      requestId: extras.requestId,
      errorCode: extras.errorCode,
      statusCode: String(extras.statusCode ?? 500),
      runtime: "cloudflare-worker",
    },
    exception: {
      values: [
        {
          type: err.name,
          value: err.message,
          stacktrace: { frames: parseStack(err.stack) },
        },
      ],
    },
    request: {
      url: request.url,
      method: request.method,
      headers: safeHeaders(request.headers),
    },
  };

  const storeUrl = `https://${parsed.host}/api/${parsed.projectId}/store/`;

  // Fire-and-forget
  try {
    fetch(storeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=ecove-worker/1.0, sentry_key=${parsed.publicKey}`,
      },
      body: JSON.stringify(event),
    }).catch(() => {
      /* swallow network errors */
    });
  } catch {
    /* swallow */
  }

  return { eventId, sent: true, rateLimited: false };
}

/**
 * Build a Sentry issue URL from a DSN and event ID.
 */
export function sentryEventUrl(eventId: string): string | null {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;
  const parsed = parseDsn(dsn);
  if (!parsed) return null;
  // Sentry org/project URL format: https://{host}/organizations/{org}/issues/?query=id:{eventId}
  // Simpler direct link:
  return `https://${parsed.host}/organizations/~/issues/?query=${eventId}`;
}
