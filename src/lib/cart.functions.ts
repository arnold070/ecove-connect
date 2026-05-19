/**
 * Cart server functions.
 * Each cart is tied to an authenticated user (1:1 via carts.user_id).
 * RLS guarantees only the owner can read/write their cart.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CartItem {
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  unit_price_kobo: number;
  product_title: string;
  product_slug: string;
  image_url: string | null;
  vendor_id: string;
  in_stock: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrCreateCart(supabase: any, userId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("carts")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created, error } = await supabase
    .from("carts")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created!.id as string;
}

export const getMyCart = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const cartId = await getOrCreateCart(supabase, userId);

    const { data, error } = await supabase
      .from("cart_items")
      .select(
        `id, product_id, variant_id, quantity, unit_price_kobo,
         product:products!inner ( id, title, slug, stock, vendor_id, status,
            images:product_images(url, sort_order, is_primary)
         )`,
      )
      .eq("cart_id", cartId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const items: CartItem[] = (data ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (row: any) => {
        const imgs = (row.product?.images ?? []) as Array<{
          url: string;
          sort_order: number;
          is_primary: boolean;
        }>;
        const primary =
          imgs.find((i) => i.is_primary) ??
          imgs.slice().sort((a, b) => a.sort_order - b.sort_order)[0];
        return {
          id: row.id,
          product_id: row.product_id,
          variant_id: row.variant_id,
          quantity: row.quantity,
          unit_price_kobo: Number(row.unit_price_kobo),
          product_title: row.product?.title ?? "Product",
          product_slug: row.product?.slug ?? "",
          image_url: primary?.url ?? null,
          vendor_id: row.product?.vendor_id ?? "",
          in_stock: Number(row.product?.stock ?? 0),
        };
      },
    );
    const subtotal = items.reduce(
      (acc, i) => acc + i.unit_price_kobo * i.quantity,
      0,
    );
    return { cartId, items, subtotal_kobo: subtotal };
  });

const addSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(99),
});

export const addToCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => addSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cartId = await getOrCreateCart(supabase, userId);

    // Fetch product to enforce approved + get current price
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id, status, price_kobo, stock")
      .eq("id", data.product_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!product) throw new Error("Product not found");
    if (product.status !== "approved")
      throw new Error("This product is not available for purchase");

    let unit_price = Number(product.price_kobo);
    if (data.variant_id) {
      const { data: v } = await supabase
        .from("product_variants")
        .select("price_kobo")
        .eq("id", data.variant_id)
        .maybeSingle();
      if (v?.price_kobo != null) unit_price = Number(v.price_kobo);
    }

    // Upsert: if same (cart, product, variant) exists, bump qty.
    const { data: existing } = await supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("cart_id", cartId)
      .eq("product_id", data.product_id)
      .is("variant_id", data.variant_id ?? null)
      .maybeSingle();

    if (existing) {
      const newQty = existing.quantity + data.quantity;
      if (newQty > Number(product.stock))
        throw new Error("Requested quantity exceeds stock");
      const { error } = await supabase
        .from("cart_items")
        .update({ quantity: newQty, unit_price_kobo: unit_price })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("cart_items").insert({
        cart_id: cartId,
        product_id: data.product_id,
        variant_id: data.variant_id ?? null,
        quantity: data.quantity,
        unit_price_kobo: unit_price,
      });
      if (error) throw new Error(error.message);
    }
    return { success: true };
  });

const updateSchema = z.object({
  item_id: z.string().uuid(),
  quantity: z.number().int().min(0).max(99),
});

export const updateCartItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.quantity === 0) {
      const { error } = await supabase.from("cart_items").delete().eq("id", data.item_id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("cart_items")
        .update({ quantity: data.quantity })
        .eq("id", data.item_id);
      if (error) throw new Error(error.message);
    }
    return { success: true };
  });

export const clearCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: cart } = await supabase
      .from("carts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (cart?.id) {
      await supabase.from("cart_items").delete().eq("cart_id", cart.id);
    }
    return { success: true };
  });
