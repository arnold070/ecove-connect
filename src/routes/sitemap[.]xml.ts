import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSiteUrl } from "@/lib/site-url";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const BASE_URL = getSiteUrl();

        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "daily", priority: "1.0" },
          { path: "/login", changefreq: "monthly", priority: "0.3" },
          { path: "/signup", changefreq: "monthly", priority: "0.3" },
          { path: "/terms", changefreq: "yearly", priority: "0.3" },
          { path: "/privacy", changefreq: "yearly", priority: "0.3" },
          { path: "/refund-policy", changefreq: "yearly", priority: "0.3" },
        ];

        try {
          const [{ data: products }, { data: vendors }] = await Promise.all([
            supabaseAdmin
              .from("products")
              .select("slug, updated_at")
              .eq("status", "approved")
              .order("updated_at", { ascending: false })
              .limit(5000),
            supabaseAdmin
              .from("vendors")
              .select("slug, updated_at")
              .eq("status", "approved")
              .order("updated_at", { ascending: false })
              .limit(5000),
          ]);
          for (const p of (products ?? []) as Array<{ slug: string; updated_at: string | null }>) {
            if (!p.slug) continue;
            entries.push({
              path: `/products/${p.slug}`,
              lastmod: p.updated_at ?? undefined,
              changefreq: "weekly",
              priority: "0.8",
            });
          }
          for (const v of (vendors ?? []) as Array<{ slug: string; updated_at: string | null }>) {
            if (!v.slug) continue;
            entries.push({
              path: `/vendors/${v.slug}`,
              lastmod: v.updated_at ?? undefined,
              changefreq: "weekly",
              priority: "0.6",
            });
          }
        } catch {
          /* still serve a valid sitemap if DB lookup fails */
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
