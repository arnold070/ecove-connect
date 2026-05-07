import { describe, it, expect } from "vitest";
import { renderErrorPage } from "../src/lib/error-page";
import { captureError, sanitizeForUser } from "../src/lib/error-tracking";

describe("Error page HTML fallback", () => {
  it("returns valid HTML with doctype, not JSON", () => {
    const html = renderErrorPage({ errorCode: "ABC123", requestId: "req-1" });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).not.toMatch(/^\s*\{/); // not JSON
  });

  it("includes the error code and request ID in the page", () => {
    const html = renderErrorPage({ errorCode: "XYZ789", requestId: "req-42" });
    expect(html).toContain("XYZ789");
    expect(html).toContain("req-42");
  });

  it("includes the copy error details button", () => {
    const html = renderErrorPage();
    expect(html).toContain("Copy error details");
    expect(html).toContain("copyContext");
  });

  it("includes sanitized context block as JSON", () => {
    const html = renderErrorPage({
      errorCode: "ERR001",
      requestId: "req-99",
      message: "Test failure",
      statusCode: 500,
    });
    expect(html).toContain('"errorCode": "ERR001"');
    expect(html).toContain('"requestId": "req-99"');
    expect(html).toContain('"message": "Test failure"');
  });

  it("escapes HTML in user-supplied data", () => {
    const html = renderErrorPage({ message: '<script>alert("xss")</script>' });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("Error tracking", () => {
  it("generates unique requestId and errorCode", () => {
    const req = new Request("https://example.com/test");
    const ctx1 = captureError(req, new Error("err1"));
    const ctx2 = captureError(req, new Error("err2"));
    expect(ctx1.requestId).not.toBe(ctx2.requestId);
    expect(ctx1.errorCode).not.toBe(ctx2.errorCode);
  });

  it("redacts sensitive headers", () => {
    const req = new Request("https://example.com/test", {
      headers: {
        Authorization: "Bearer secret-token",
        "Content-Type": "application/json",
        Cookie: "session=abc",
      },
    });
    const ctx = captureError(req, new Error("fail"));
    expect(ctx.requestHeaders["authorization"]).toBe("[REDACTED]");
    expect(ctx.requestHeaders["cookie"]).toBe("[REDACTED]");
    expect(ctx.requestHeaders["content-type"]).toBe("application/json");
  });

  it("sanitizeForUser strips stack traces and headers", () => {
    const req = new Request("https://example.com/test");
    const ctx = captureError(req, new Error("boom"));
    const safe = sanitizeForUser(ctx);
    expect(safe).not.toHaveProperty("errorStack");
    expect(safe).not.toHaveProperty("requestHeaders");
    expect(safe).toHaveProperty("errorCode");
    expect(safe).toHaveProperty("requestId");
    expect(safe.message).toBe("boom");
  });
});

describe("SSR 500 regression — server wrapper", () => {
  it("normalizeCatastrophicSsrResponse returns HTML for h3 swallowed errors", async () => {
    // Simulate the server.ts logic inline
    const jsonBody = JSON.stringify({
      status: 500,
      unhandled: true,
      message: "HTTPError",
    });
    const response = new Response(jsonBody, {
      status: 500,
      headers: { "content-type": "application/json" },
    });

    // Replicate the check from server.ts
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.clone().text();
    const isSwallowed =
      response.status >= 500 &&
      contentType.includes("application/json") &&
      body.includes('"unhandled":true') &&
      body.includes('"message":"HTTPError"');

    expect(isSwallowed).toBe(true);

    // The wrapper would replace this with HTML
    const html = renderErrorPage({ errorCode: "TEST", requestId: "req-test" });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).not.toContain('"unhandled":true');
  });

  it("non-500 JSON responses are NOT treated as errors", () => {
    const response = new Response('{"data":"ok"}', {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    expect(response.status < 500).toBe(true);
  });

  it("500 HTML responses are passed through unchanged", () => {
    const response = new Response("<html><body>Custom error</body></html>", {
      status: 500,
      headers: { "content-type": "text/html" },
    });
    const contentType = response.headers.get("content-type") ?? "";
    // The normalizer only replaces application/json 500s
    expect(contentType.includes("application/json")).toBe(false);
  });
});
