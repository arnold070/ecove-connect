/**
 * Lightweight error tracking with correlation/request IDs.
 * Generates a short error code for user display and logs full context server-side.
 */

const SENSITIVE_KEYS = /^(password|authorization|cookie|secret|token|x-api-key|x-connection-api-key)$/i;

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = SENSITIVE_KEYS.test(key) ? "[REDACTED]" : value;
  }
  return result;
}

function generateRequestId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${ts}-${rand}`;
}

function generateErrorCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export interface ErrorContext {
  requestId: string;
  errorCode: string;
  timestamp: string;
  method: string;
  url: string;
  statusCode: number;
  errorMessage: string;
  errorStack?: string;
  requestHeaders: Record<string, string>;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

export function captureError(
  request: Request,
  error: unknown,
  statusCode = 500,
): ErrorContext {
  const requestId = generateRequestId();
  const errorCode = generateErrorCode();
  const err = error instanceof Error ? error : new Error(String(error));

  const ctx: ErrorContext = {
    requestId,
    errorCode,
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
    statusCode,
    errorMessage: err.message,
    errorStack: err.stack,
    requestHeaders: sanitizeHeaders(headersToRecord(request.headers)),
  };

  // Log full context server-side for tracing
  console.error(
    JSON.stringify({
      level: "error",
      requestId: ctx.requestId,
      errorCode: ctx.errorCode,
      timestamp: ctx.timestamp,
      method: ctx.method,
      url: ctx.url,
      statusCode: ctx.statusCode,
      message: ctx.errorMessage,
      stack: ctx.errorStack,
    }),
  );

  return ctx;
}

/**
 * Returns a sanitized subset safe to expose to users (no stack traces, no headers).
 */
export function sanitizeForUser(ctx: ErrorContext): {
  requestId: string;
  errorCode: string;
  timestamp: string;
  url: string;
  statusCode: number;
  message: string;
} {
  return {
    requestId: ctx.requestId,
    errorCode: ctx.errorCode,
    timestamp: ctx.timestamp,
    url: ctx.url,
    statusCode: ctx.statusCode,
    message: ctx.errorMessage,
  };
}
