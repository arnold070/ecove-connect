import "./lib/error-capture";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { captureError, sanitizeForUser } from "./lib/error-tracking";

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
  const ctx = captureError(request, underlying, 500);
  const userCtx = sanitizeForUser(ctx);

  return new Response(renderErrorPage(userCtx), {
    status: 500,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-request-id": ctx.requestId,
      "x-error-code": ctx.errorCode,
    },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(request, response);
    } catch (error) {
      const errCtx = captureError(request, error, 500);
      const userCtx = sanitizeForUser(errCtx);
      return new Response(renderErrorPage(userCtx), {
        status: 500,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-request-id": errCtx.requestId,
          "x-error-code": errCtx.errorCode,
        },
      });
    }
  },
};
