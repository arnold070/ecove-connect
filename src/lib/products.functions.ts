/**
 * Vendor product CRUD + admin moderation.
 * Vendor RLS limits writes to their own products; admin assertions guard
 * approve/reject/suspend.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "@/lib/slug";

export type ProductStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "suspended"
  | "archived";

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  cloudinary_public_id: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
  position: number;
  is_primary: boolean;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price_kobo: number | null;
  compare_at_kobo: number | null;
  stock: number;
  attributes: Record<string, string>;
  position: number;
}

export interface ProductRow {
  id: string;
  vendor_id: string;
  category_id: string | null;
  subcategory_id: string | null;
  title: string;
  slug: string;
  description: string | null;
  price_kobo: number;
  compare_at_kobo: number | null;
  stock: number;
  sku: string | null;
  weight_grams: number | null;
  status: ProductStatus;
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductDetail extends ProductRow {
  images: ProductImage[];
  variants: ProductVariant[];
  vendor?: { id: string; store_name: string; slug: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMyVendorOrThrow(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("vendors")
    .select("id, status")
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Create a vendor profile first");
  if (data.status !== "approved") {
    throw new Error("Vendor must be approved before listing products");
  }
  return data as { id: string; status: string };
}

// ---------------------------------------------------------------------------
// CATEGORIES — public list grouped (parents + children)
// ---------------------------------------------------------------------------
export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  parent_id: string | null;
  children: CategoryNode[];
}

export const listCategories = createServerFn({ method: "GET" }).handler(async () => {
  // public — use admin client via auth-middleware free path? Categories are public-readable.
  // Use a fresh anon client via the middleware's pattern. Simpler: call from logged-in vendor.
  // For SSR safety, use supabase admin (bypasses RLS but it's public read anyway).
  // We avoid importing client.server from a .functions file with mixed exports —
  // categories are public, so use the publishable client via a fresh fetch.
  const url = process.env.ECOVE_SUPABASE_URL ?? "";
  const anon = process.env.ECOVE_SUPABASE_PUBLISHABLE_KEY ?? "";
  const res = await fetch(
    `${url}/rest/v1/categories?select=id,name,slug,icon,parent_id&order=position.asc`,
    {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    },
  );
  if (!res.ok) throw new Error(`Categories fetch failed: ${res.status}`);
  const rows = (await res.json()) as Array<{
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    parent_id: string | null;
  }>;
  const byParent = new Map<string | null, typeof rows>();
  for (const r of rows) {
    const arr = byParent.get(r.parent_id) ?? [];
    arr.push(r);
    byParent.set(r.parent_id, arr);
  }
  const build = (parentId: string | null): CategoryNode[] =>
    (byParent.get(parentId) ?? []).map((r) => ({
      ...r,
      children: build(r.id),
    }));
  return { tree: build(null) };
});

// ---------------------------------------------------------------------------
// CREATE / UPDATE
// ---------------------------------------------------------------------------
const productSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(8000).optional().nullable(),
  price_kobo: z.number().int().min(0),
  compare_at_kobo: z.number().int().min(0).optional().nullable(),
  stock: z.number().int().min(0),
  sku: z.string().trim().max(80).optional().nullable(),
  weight_grams: z.number().int().min(0).optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  subcategory_id: z.string().uuid().optional().nullable(),
});

export const createProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => productSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendor = await getMyVendorOrThrow(supabase, userId);

    const base = slugify(data.title) || "product";
    let slug = base;
    for (let i = 0; i < 5; i++) {
      const { data: clash } = await supabase
        .from("products")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!clash) break;
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const { data: created, error } = await supabase
      .from("products")
      .insert({
        vendor_id: vendor.id,
        title: data.title,
        slug,
        description: data.description ?? null,
        price_kobo: data.price_kobo,
        compare_at_kobo: data.compare_at_kobo ?? null,
        stock: data.stock,
        sku: data.sku ?? null,
        weight_grams: data.weight_grams ?? null,
        category_id: data.category_id ?? null,
        subcategory_id: data.subcategory_id ?? null,
        status: "draft",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { productId: created.id as string };
  });

const updateSchema = productSchema.extend({ id: z.string().uuid() });

export const updateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await getMyVendorOrThrow(supabase, userId);

    const { id, ...rest } = data;
    // If status was rejected, allow edit and reset to draft.
    const { data: cur } = await supabase
      .from("products")
      .select("status")
      .eq("id", id)
      .single();
    const newStatus =
      cur?.status === "rejected" || cur?.status === "approved" ? "draft" : cur?.status;

    const { error } = await supabase
      .from("products")
      .update({
        title: rest.title,
        description: rest.description ?? null,
        price_kobo: rest.price_kobo,
        compare_at_kobo: rest.compare_at_kobo ?? null,
        stock: rest.stock,
        sku: rest.sku ?? null,
        weight_grams: rest.weight_grams ?? null,
        category_id: rest.category_id ?? null,
        subcategory_id: rest.subcategory_id ?? null,
        status: newStatus,
        rejection_reason: null,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);

    await supabase.from("product_moderation_audit").insert({
      product_id: id,
      action: "edit",
      actor_id: userId,
    });
    return { success: true };
  });

// ---------------------------------------------------------------------------
// IMAGES
// ---------------------------------------------------------------------------
const addImageSchema = z.object({
  product_id: z.string().uuid(),
  url: z.string().url().max(500),
  cloudinary_public_id: z.string().max(300).optional().nullable(),
  width: z.number().int().optional().nullable(),
  height: z.number().int().optional().nullable(),
  alt: z.string().max(200).optional().nullable(),
});

export const addProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => addImageSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { count } = await supabase
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("product_id", data.product_id);
    const position = count ?? 0;
    const { data: row, error } = await supabase
      .from("product_images")
      .insert({
        product_id: data.product_id,
        url: data.url,
        cloudinary_public_id: data.cloudinary_public_id ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
        alt: data.alt ?? null,
        position,
        is_primary: position === 0,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as ProductImage;
  });

export const deleteProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("product_images").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const reorderProductImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        product_id: z.string().uuid(),
        order: z.array(z.string().uuid()).min(1).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Update positions sequentially; mark first as primary.
    for (let i = 0; i < data.order.length; i++) {
      const { error } = await supabase
        .from("product_images")
        .update({ position: i, is_primary: i === 0 })
        .eq("id", data.order[i])
        .eq("product_id", data.product_id);
      if (error) throw new Error(error.message);
    }
    return { success: true };
  });

// ---------------------------------------------------------------------------
// VARIANTS
// ---------------------------------------------------------------------------
const variantSchema = z.object({
  product_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().max(80).optional().nullable(),
  price_kobo: z.number().int().min(0).optional().nullable(),
  compare_at_kobo: z.number().int().min(0).optional().nullable(),
  stock: z.number().int().min(0),
  attributes: z.record(z.string(), z.string()).optional(),
});

export const addProductVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => variantSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { count } = await supabase
      .from("product_variants")
      .select("id", { count: "exact", head: true })
      .eq("product_id", data.product_id);
    const { data: row, error } = await supabase
      .from("product_variants")
      .insert({
        product_id: data.product_id,
        name: data.name,
        sku: data.sku ?? null,
        price_kobo: data.price_kobo ?? null,
        compare_at_kobo: data.compare_at_kobo ?? null,
        stock: data.stock,
        attributes: data.attributes ?? {},
        position: count ?? 0,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as ProductVariant;
  });

export const updateProductVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => variantSchema.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, product_id: _pid, ...rest } = data;
    const { error } = await supabase
      .from("product_variants")
      .update({
        name: rest.name,
        sku: rest.sku ?? null,
        price_kobo: rest.price_kobo ?? null,
        compare_at_kobo: rest.compare_at_kobo ?? null,
        stock: rest.stock,
        attributes: rest.attributes ?? {},
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const deleteProductVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("product_variants").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ---------------------------------------------------------------------------
// READ — vendor scoped
// ---------------------------------------------------------------------------
export const getProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: product, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: images } = await supabase
      .from("product_images")
      .select("*")
      .eq("product_id", data.id)
      .order("position", { ascending: true });
    const { data: variants } = await supabase
      .from("product_variants")
      .select("*")
      .eq("product_id", data.id)
      .order("position", { ascending: true });
    const { data: vendor } = await supabase
      .from("vendors")
      .select("id, store_name, slug")
      .eq("id", product.vendor_id)
      .maybeSingle();
    return {
      ...(product as ProductRow),
      images: (images ?? []) as ProductImage[],
      variants: (variants ?? []) as ProductVariant[],
      vendor: vendor ?? undefined,
    } as ProductDetail;
  });

const listMineSchema = z.object({
  status: z
    .enum(["draft", "pending", "approved", "rejected", "suspended", "archived"])
    .optional(),
  page: z.number().int().min(1).max(10000).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const listMyProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listMineSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: vendor } = await supabase
      .from("vendors")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (!vendor) return { products: [] as ProductRow[], total: 0, page: 1, pageSize: 25 };

    const pageSize = data.pageSize ?? 25;
    const page = data.page ?? 1;
    const from = (page - 1) * pageSize;

    let q = supabase
      .from("products")
      .select("*", { count: "exact" })
      .eq("vendor_id", vendor.id)
      .order("created_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status);

    const { data: rows, count, error } = await q.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return {
      products: (rows ?? []) as ProductRow[],
      total: count ?? 0,
      page,
      pageSize,
    };
  });

// ---------------------------------------------------------------------------
// SUBMIT FOR REVIEW
// ---------------------------------------------------------------------------
export const submitProductForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: p } = await supabase
      .from("products")
      .select("status, title, price_kobo")
      .eq("id", data.id)
      .single();
    if (!p) throw new Error("Product not found");
    if (!["draft", "rejected"].includes(p.status)) {
      throw new Error(`Cannot submit: status is '${p.status}'`);
    }

    const { count } = await supabase
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("product_id", data.id);
    if (!count || count < 1) throw new Error("Add at least one product image first");

    const { error } = await supabase
      .from("products")
      .update({
        status: "pending",
        submitted_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabase.from("product_moderation_audit").insert({
      product_id: data.id,
      action: "submit",
      actor_id: userId,
    });
    return { success: true };
  });

// ---------------------------------------------------------------------------
// ADMIN MODERATION
// ---------------------------------------------------------------------------
const adminListSchema = z.object({
  status: z
    .enum(["draft", "pending", "approved", "rejected", "suspended", "archived"])
    .optional(),
  search: z.string().trim().max(200).optional(),
  page: z.number().int().min(1).max(10000).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const listProductsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => adminListSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const status = data.status ?? "pending";
    const pageSize = data.pageSize ?? 25;
    const page = data.page ?? 1;
    const from = (page - 1) * pageSize;

    let q = supabase
      .from("products")
      .select("*, vendors:vendor_id(store_name, slug)", { count: "exact" })
      .eq("status", status)
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (data.search) q = q.ilike("title", `%${data.search}%`);

    const { data: rows, count, error } = await q.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return { products: rows ?? [], total: count ?? 0, page, pageSize };
  });

export const getProductAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: product, error } = await supabase
      .from("products")
      .select("*, vendors:vendor_id(id, store_name, slug)")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: images } = await supabase
      .from("product_images")
      .select("*")
      .eq("product_id", data.id)
      .order("position");
    const { data: variants } = await supabase
      .from("product_variants")
      .select("*")
      .eq("product_id", data.id)
      .order("position");
    const { data: audit } = await supabase
      .from("product_moderation_audit")
      .select("*")
      .eq("product_id", data.id)
      .order("created_at", { ascending: false });
    return {
      product,
      images: images ?? [],
      variants: variants ?? [],
      audit: audit ?? [],
    };
  });

export const approveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("products")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
        rejection_reason: null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("product_moderation_audit").insert({
      product_id: data.id,
      action: "approve",
      note: data.note ?? null,
      actor_id: userId,
    });
    return { success: true };
  });

export const rejectProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(500) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("products")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
        rejection_reason: data.reason,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("product_moderation_audit").insert({
      product_id: data.id,
      action: "reject",
      note: data.reason,
      actor_id: userId,
    });
    return { success: true };
  });

export const suspendProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(500) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("products")
      .update({
        status: "suspended",
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
        rejection_reason: data.reason,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("product_moderation_audit").insert({
      product_id: data.id,
      action: "suspend",
      note: data.reason,
      actor_id: userId,
    });
    return { success: true };
  });

export const reinstateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("products")
      .update({
        status: "approved",
        rejection_reason: null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("product_moderation_audit").insert({
      product_id: data.id,
      action: "reinstate",
      actor_id: userId,
    });
    return { success: true };
  });
