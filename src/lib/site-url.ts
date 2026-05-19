/**
 * Resolves the canonical public site URL.
 *
 * Set `VITE_PUBLIC_SITE_URL` in your deployment environment (e.g.
 * `https://ecove.ng`). Vite inlines `import.meta.env.VITE_*` at build
 * time so this works in both server (SSR) and client renders without
 * extra wiring.
 *
 * Falls back to the Lovable preview URL so previews stay shareable.
 */
const FALLBACK = "https://ecove-connect.lovable.app";

function stripTrailingSlash(u: string): string {
  return u.endsWith("/") ? u.slice(0, -1) : u;
}

export function getSiteUrl(): string {
  const fromEnv =
    (typeof import.meta !== "undefined" &&
      (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
        ?.VITE_PUBLIC_SITE_URL) ||
    // Server runtime fallback if the build-time inline wasn't applied.
    (typeof process !== "undefined" ? process.env?.PUBLIC_SITE_URL : undefined) ||
    FALLBACK;
  return stripTrailingSlash(String(fromEnv));
}

export function absoluteUrl(path: string): string {
  const base = getSiteUrl();
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}
