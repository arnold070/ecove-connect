/**
 * Public vendor profile + sitemap helpers.
 * RLS allows public reads of approved vendors and approved products.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface PublicVendor {
  id: string;
  slug: string;
  store_name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  rating_avg: number;
  rating_count: number;
  products: Array<{
    id: string;
    slug: string;
    title: string;
    price_kobo: number;
    image: string | null;
  }>;
}

export const getPublicVendorBySlug = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ slug: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }): Promise<PublicVendor | null> => {
    const { data: vendor } = await supabaseAdmin
      .from("vendors")
      .select(
        "id, slug, store_name, description, logo_url, banner_url, rating_avg, rating_count, status",
      )
      .eq("slug", data.slug)
      .eq("status", "approved")
      .maybeSingle();
    if (!vendor) return null;

    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id, slug, title, price_kobo")
      .eq("vendor_id", vendor.id)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(48);

    // Fetch first image per product
    const ids = (products ?? []).map((p) => p.id);
    const { data: imgs } = ids.length
      ? await supabaseAdmin
          .from("product_images")
          .select("product_id, url")
          .in("product_id", ids)
          .order("position", { ascending: true })
      : { data: [] as Array<{ product_id: string; url: string }> };
    const imgByProduct = new Map<string, string>();
    for (const i of imgs ?? []) {
      if (!imgByProduct.has(i.product_id)) imgByProduct.set(i.product_id, i.url);
    }

    return {
      id: vendor.id,
      slug: vendor.slug,
      store_name: vendor.store_name,
      description: vendor.description,
      logo_url: vendor.logo_url,
      banner_url: vendor.banner_url,
      rating_avg: Number(vendor.rating_avg ?? 0),
      rating_count: vendor.rating_count ?? 0,
      products: (products ?? []).map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        price_kobo: Number(p.price_kobo),
        image: imgByProduct.get(p.id) ?? null,
      })),
    };
  });
