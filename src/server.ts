import "./lib/error-capture";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { captureError, sanitizeForUser } from "./lib/error-tracking";
import { reportToSentry, sentryEventUrl } from "./lib/sentry.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (module) => (module.default ?? module) as ServerEntry,
    );
  }

  return serverEntryPromise;
}

async function handleCatastrophicError(
  request: Request,
  error: unknown,
  statusCode: number,
): Promise<Response> {
  const ctx = captureError(request, error, statusCode);
  const userCtx = sanitizeForUser(ctx);

  // Report to Sentry with requestId/errorCode as tags
  const sentryResult = await reportToSentry(request, error, {
    requestId: ctx.requestId,
    errorCode: ctx.errorCode,
    statusCode,
  });

  const sentryUrl = sentryResult.sent ? sentryEventUrl(sentryResult.eventId) : null;

  return new Response(
    renderErrorPage({
      ...userCtx,
      sentryEventId: sentryResult.eventId,
      sentryUrl: sentryUrl ?? undefined,
    }),
    {
      status: statusCode,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-request-id": ctx.requestId,
        "x-error-code": ctx.errorCode,
        ...(sentryResult.sent ? { "x-sentry-event-id": sentryResult.eventId } : {}),
      },
    },
  );
}

async function normalizeCatastrophicSsrResponse(
  request: Request,
  response: Response,
): Promise<Response> {
  if (response.status < 500) return response;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  const captured = consumeLastCapturedError();
  const underlying = captured ?? new Error(`h3 swallowed SSR error: ${body}`);
  return handleCatastrophicError(request, underlying, 500);
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(request, response);
    } catch (error) {
      return handleCatastrophicError(request, error, 500);
    }
  },
};
