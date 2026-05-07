export function renderErrorPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Something went wrong</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f8fafc; color: #0f172a; }
      main { width: min(92vw, 28rem); text-align: center; }
      h1 { margin: 0; font-size: 1.875rem; line-height: 1.2; }
      p { margin: 0.75rem 0 1.5rem; color: #475569; line-height: 1.6; }
      .actions { display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap; }
      a, button { border-radius: 0.375rem; border: 1px solid #cbd5e1; padding: 0.625rem 0.875rem; font: inherit; text-decoration: none; cursor: pointer; }
      button { background: #0f172a; color: #ffffff; border-color: #0f172a; }
      a { background: #ffffff; color: #0f172a; }
    </style>
  </head>
  <body>
    <main>
      <h1>Something went wrong</h1>
      <p>The app hit an unexpected server error. You can refresh this page or return home.</p>
      <div class="actions">
        <button type="button" onclick="location.reload()">Refresh</button>
        <a href="/">Go home</a>
      </div>
    </main>
  </body>
</html>`;
}