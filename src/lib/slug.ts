// Tiny slugify helper. Used to derive URL-safe slugs for products.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Append a short random suffix so we don't collide with existing slugs. */
export function uniqueSlug(input: string): string {
  const base = slugify(input) || "product";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}
