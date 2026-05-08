/**
 * Self-contained HTML error page with error code, request ID, Sentry link, and copy-context button.
 * Must NOT import any app code to avoid cascading failures.
 */

export interface ErrorPageData {
  errorCode: string;
  requestId: string;
  timestamp: string;
  url: string;
  statusCode: number;
  message: string;
  sentryEventId?: string;
  sentryUrl?: string;
}

const defaultData: ErrorPageData = {
  errorCode: "UNKNOWN",
  requestId: "none",
  timestamp: new Date().toISOString(),
  url: "",
  statusCode: 500,
  message: "An unexpected server error occurred.",
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderErrorPage(data?: Partial<ErrorPageData>): string {
  const d = { ...defaultData, ...data };
  const sanitizedContext = JSON.stringify(
    {
      errorCode: d.errorCode,
      requestId: d.requestId,
      timestamp: d.timestamp,
      url: d.url,
      statusCode: d.statusCode,
      message: d.message,
      ...(d.sentryEventId ? { sentryEventId: d.sentryEventId } : {}),
    },
    null,
    2,
  );

  const sentryLink = d.sentryUrl
    ? `<a href="${escapeHtml(d.sentryUrl)}" target="_blank" rel="noopener noreferrer" class="sentry-link">View in Sentry ↗</a>`
    : "";

  const sentryIdLine = d.sentryEventId
    ? `<div class="sentry-id">Sentry Event: ${escapeHtml(d.sentryEventId)}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Error ${escapeHtml(d.errorCode)} — Something went wrong</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f8fafc; color: #0f172a; }
      main { width: min(92vw, 32rem); text-align: center; }
      h1 { margin: 0; font-size: 1.875rem; line-height: 1.2; }
      .error-code { display: inline-block; margin-top: 0.5rem; padding: 0.25rem 0.75rem; background: #fee2e2; color: #991b1b; border-radius: 0.375rem; font-family: monospace; font-size: 0.875rem; font-weight: 600; letter-spacing: 0.05em; }
      .request-id { margin-top: 0.5rem; color: #94a3b8; font-family: monospace; font-size: 0.75rem; }
      .sentry-id { margin-top: 0.25rem; color: #94a3b8; font-family: monospace; font-size: 0.75rem; }
      p { margin: 0.75rem 0 1.5rem; color: #475569; line-height: 1.6; }
      .actions { display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap; }
      a, button { border-radius: 0.375rem; border: 1px solid #cbd5e1; padding: 0.625rem 0.875rem; font: inherit; font-size: 0.875rem; text-decoration: none; cursor: pointer; transition: background 0.15s; }
      button.primary { background: #0f172a; color: #ffffff; border-color: #0f172a; }
      button.primary:hover { background: #1e293b; }
      a { background: #ffffff; color: #0f172a; }
      a:hover { background: #f1f5f9; }
      .sentry-link { background: #7c3aed; color: #ffffff; border-color: #7c3aed; }
      .sentry-link:hover { background: #6d28d9; color: #ffffff; }
      button.copy { background: #ffffff; color: #0f172a; }
      button.copy:hover { background: #f1f5f9; }
      .context-block { margin-top: 1.5rem; text-align: left; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 0.5rem; padding: 1rem; max-height: 12rem; overflow: auto; }
      .context-block pre { margin: 0; font-size: 0.75rem; font-family: monospace; white-space: pre-wrap; word-break: break-all; color: #334155; }
      .context-label { font-size: 0.75rem; color: #64748b; margin-bottom: 0.5rem; font-weight: 500; }
      .copied { color: #16a34a !important; }
    </style>
  </head>
  <body>
    <main>
      <h1>Something went wrong</h1>
      <div class="error-code">${escapeHtml(d.errorCode)}</div>
      <div class="request-id">Request ID: ${escapeHtml(d.requestId)}</div>
      ${sentryIdLine}
      <p>The server encountered an unexpected error. You can refresh or go home. If the problem persists, share the error details below with support.</p>
      <div class="actions">
        <button type="button" class="primary" onclick="location.reload()">Refresh</button>
        <a href="/">Go home</a>
        ${sentryLink}
        <button type="button" class="copy" id="copy-btn" onclick="copyContext()">Copy error details</button>
      </div>
      <div class="context-block">
        <div class="context-label">Sanitized error context</div>
        <pre id="ctx">${escapeHtml(sanitizedContext)}</pre>
      </div>
    </main>
    <script>
      function copyContext() {
        var text = document.getElementById('ctx').textContent;
        var btn = document.getElementById('copy-btn');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(function() {
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(function() { btn.textContent = 'Copy error details'; btn.classList.remove('copied'); }, 2000);
          });
        } else {
          var ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(function() { btn.textContent = 'Copy error details'; btn.classList.remove('copied'); }, 2000);
        }
      }
    </script>
  </body>
</html>`;
}
