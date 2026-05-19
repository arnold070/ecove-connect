/**
 * Public PDP server fn: fetches an approved product by slug with images,
 * variants, and vendor name. RLS allows public reads of status='approved'.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface PublicProduct {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price_kobo: number;
  compare_at_kobo: number | null;
  stock: number;
  images: Array<{ url: string; alt: string | null; width: number | null; height: number | null }>;
  variants: Array<{ id: string; name: string; price_kobo: number | null; stock: number }>;
  vendor: { id: string; name: string; slug: string } | null;
}

export const getPublicProductBySlug = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ slug: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }): Promise<PublicProduct | null> => {
    const { data: product, error } = await supabaseAdmin
      .from("products")
      .select(
        "id, title, slug, description, price_kobo, compare_at_kobo, stock, status, vendor_id",
      )
      .eq("slug", data.slug)
      .eq("status", "approved")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!product) return null;

    const [imagesRes, variantsRes, vendorRes] = await Promise.all([
      supabaseAdmin
        .from("product_images")
        .select("url, alt, width, height")
        .eq("product_id", product.id)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("product_variants")
        .select("id, name, price_kobo, stock")
        .eq("product_id", product.id)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("vendors")
        .select("id, store_name, slug")
        .eq("id", product.vendor_id)
        .maybeSingle(),
    ]);

    return {
      id: product.id,
      title: product.title,
      slug: product.slug,
      description: product.description,
      price_kobo: product.price_kobo,
      compare_at_kobo: product.compare_at_kobo,
      stock: product.stock,
      images: imagesRes.data ?? [],
      variants: variantsRes.data ?? [],
      vendor: vendorRes.data
        ? { id: vendorRes.data.id, name: vendorRes.data.store_name, slug: vendorRes.data.slug }
        : null,
    };
  });
