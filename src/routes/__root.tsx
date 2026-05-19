import type { ReactNode } from "react";
import { useState, useMemo, useCallback } from "react";
import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/auth/AuthProvider";
import { LiveChatWidget } from "@/components/live-chat-widget";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  console.error(error);

  const errorCode = useMemo(
    () => Math.random().toString(36).substring(2, 8).toUpperCase(),
    [],
  );

  const sanitizedContext = useMemo(
    () =>
      JSON.stringify(
        {
          errorCode,
          timestamp: new Date().toISOString(),
          message: error.message,
          url: typeof window !== "undefined" ? window.location.href : "",
        },
        null,
        2,
      ),
    [errorCode, error.message],
  );

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(sanitizedContext).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [sanitizedContext]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
        <div className="mt-2 inline-block rounded-md bg-destructive/10 px-3 py-1 font-mono text-sm font-semibold tracking-wider text-destructive">
          {errorCode}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred. Share the error code above with support if the issue persists.
        </p>
        {import.meta.env.DEV && error.message && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">
            {error.message}
          </pre>
        )}
        <div className="mt-4 rounded-lg border border-border bg-muted/50 p-3 text-left">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Sanitized error context</div>
          <pre className="max-h-32 overflow-auto font-mono text-xs text-foreground/80">
            {sanitizedContext}
          </pre>
        </div>
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </Link>
          <button
            onClick={handleCopy}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {copied ? "Copied!" : "Copy details"}
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ecove — Nigeria's multi-vendor marketplace" },
      {
        name: "description",
        content:
          "Shop from thousands of trusted Nigerian vendors. Fast delivery nationwide, secure Naira payments.",
      },
      { name: "author", content: "ecove" },
      { property: "og:title", content: "ecove — Nigeria's multi-vendor marketplace" },
      {
        property: "og:description",
        content: "Shop from thousands of trusted Nigerian vendors. Pay in Naira.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  errorComponent: ErrorComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
      <LiveChatWidget />
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}
