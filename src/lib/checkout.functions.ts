/**
 * Checkout: creates a pending order from the user's cart, then calls Paystack
 * /transaction/initialize to get an authorization URL. After payment, the
 * webhook (`/api/public/paystack-webhook`) flips the order to `paid`.
 *
 * verifyCheckout() can be called from the success page as a fallback
 * (idempotent — won't double-mark).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPlatformValue } from "./platform-settings.server";

const initSchema = z.object({
  shipping: z.object({
    full_name: z.string().min(1).max(120),
    phone: z.string().min(5).max(40),
    address_line1: z.string().min(1).max(200),
    address_line2: z.string().max(200).optional(),
    city: z.string().min(1).max(80),
    state: z.string().min(1).max(80),
    country: z.string().min(2).max(80).default("Nigeria"),
    email: z.string().email(),
  }),
});

export const initializeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => initSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Per-user rate limit: at most 20 checkout-init calls per minute.
    // Uses the same db-backed sliding window as the webhook handler.
    const { data: hit } = await supabase.rpc("bump_rate_limit", {
      _key: `checkout-init:${userId}`,
      _window_seconds: 60,
    });
    if (typeof hit === "number" && hit > 20) {
      throw new Error("Too many checkout attempts — please wait a minute and try again.");
    }



    // 1. Load cart items
    const { data: cart } = await supabase
      .from("carts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!cart?.id) throw new Error("Cart is empty");

    const { data: items, error: iErr } = await supabase
      .from("cart_items")
      .select(
        `id, product_id, variant_id, quantity, unit_price_kobo,
         product:products!inner ( id, title, vendor_id, status, stock )`,
      )
      .eq("cart_id", cart.id);
    if (iErr) throw new Error(iErr.message);
    if (!items || items.length === 0) throw new Error("Cart is empty");

    // Validate stock + approved
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const it of items as any[]) {
      if (it.product?.status !== "approved")
        throw new Error(`Product ${it.product?.title ?? ""} is no longer available`);
      if (it.product?.stock < it.quantity)
        throw new Error(`Insufficient stock for ${it.product?.title ?? "product"}`);
    }

    // 2. Compute totals + commission
    const commissionBpsRaw = await getPlatformValue("PLATFORM_COMMISSION_BPS");
    const bps = Math.max(0, Math.min(10000, Number(commissionBpsRaw) || 0));

    const subtotal = (items as Array<{ quantity: number; unit_price_kobo: number }>).reduce(
      (a, i) => a + i.quantity * Number(i.unit_price_kobo),
      0,
    );

    // 3. Create order
    const { data: order, error: oErr } = await supabase
      .from("orders")
      .insert({
        customer_id: userId,
        shipping_snapshot: data.shipping,
        subtotal_kobo: subtotal,
        total_kobo: subtotal,
        status: "pending",
      })
      .select("id, order_number, total_kobo")
      .single();
    if (oErr) throw new Error(oErr.message);

    // 4. Create order_items (trigger validates approved + stock)
    const orderItemRows = (items as Array<{
      product_id: string;
      variant_id: string | null;
      quantity: number;
      unit_price_kobo: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      product: any;
    }>).map((i) => {
      const lineTotal = i.quantity * Number(i.unit_price_kobo);
      const commission = Math.floor((lineTotal * bps) / 10000);
      return {
        order_id: order!.id,
        vendor_id: i.product.vendor_id,
        product_id: i.product_id,
        variant_id: i.variant_id,
        product_title: i.product.title,
        quantity: i.quantity,
        unit_price_kobo: Number(i.unit_price_kobo),
        commission_kobo: commission,
        vendor_payout_kobo: lineTotal - commission,
      };
    });

    const { error: oiErr } = await supabase.from("order_items").insert(orderItemRows);
    if (oiErr) {
      // Roll back the empty order to keep the table clean
      await supabase.from("orders").delete().eq("id", order!.id);
      throw new Error(oiErr.message);
    }

    // 5. Initialize Paystack transaction
    const [secret, callback] = await Promise.all([
      getPlatformValue("PAYSTACK_SECRET_KEY"),
      getPlatformValue("PAYSTACK_CALLBACK_URL"),
    ]);
    if (!secret)
      throw new Error("Paystack not configured. Ask an admin to set PAYSTACK_SECRET_KEY.");

    const reference = `EC-${order!.id.slice(0, 8)}-${Date.now()}`;
    const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: data.shipping.email,
        amount: subtotal, // already in kobo
        reference,
        currency: "NGN",
        callback_url: callback || undefined,
        metadata: {
          order_id: order!.id,
          order_number: order!.order_number,
          customer_id: userId,
        },
      }),
    });
    const initJson = (await initRes.json().catch(() => ({}))) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url: string; access_code: string; reference: string };
    };
    if (!initRes.ok || !initJson.status || !initJson.data) {
      await supabase.from("orders").delete().eq("id", order!.id);
      throw new Error(
        `Paystack init failed: ${initJson.message ?? initRes.statusText}`,
      );
    }

    await supabase
      .from("orders")
      .update({
        paystack_reference: initJson.data.reference,
        paystack_access_code: initJson.data.access_code,
        paystack_authorization_url: initJson.data.authorization_url,
      })
      .eq("id", order!.id);

    // Clear cart now that the order is created
    await supabase.from("cart_items").delete().eq("cart_id", cart.id);

    return {
      order_id: order!.id,
      order_number: order!.order_number,
      reference: initJson.data.reference,
      authorization_url: initJson.data.authorization_url,
    };
  });

const verifySchema = z.object({ reference: z.string().min(1).max(120) });

export const verifyCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => verifySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: order } = await supabase
      .from("orders")
      .select("id, status, total_kobo, customer_id")
      .eq("paystack_reference", data.reference)
      .maybeSingle();
    if (!order) throw new Error("Order not found");
    if (order.customer_id !== userId) throw new Error("Forbidden");

    if (order.status === "paid")
      return { status: "paid", order_id: order.id };

    // Verify with Paystack
    const secret = await getPlatformValue("PAYSTACK_SECRET_KEY");
    if (!secret) throw new Error("Paystack not configured");
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const json = (await res.json().catch(() => ({}))) as {
      status?: boolean;
      data?: { status?: string; amount?: number };
    };
    if (!res.ok || !json.status)
      return { status: order.status, order_id: order.id };

    if (json.data?.status === "success") {
      await supabase
        .from("orders")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", order.id);
      await supabase.from("payments").insert({
        order_id: order.id,
        provider: "paystack",
        provider_reference: data.reference,
        amount_kobo: json.data.amount ?? order.total_kobo,
        status: "success",
        raw: json,
      });
      return { status: "paid", order_id: order.id };
    }
    return { status: order.status, order_id: order.id };
  });

// -- Buyer/admin order queries ----------------------------------------------

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("orders")
      .select(
        `id, order_number, status, total_kobo, paystack_reference, created_at, paid_at,
         items:order_items(id, product_title, quantity, unit_price_kobo, status)`,
      )
      .eq("customer_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { orders: data ?? [] };
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

const adminListSchema = z.object({
  status: z
    .enum(["pending", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"])
    .optional(),
  page: z.number().int().min(1).max(1000).optional(),
});

export const listOrdersAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => adminListSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const pageSize = 25;
    const page = data.page ?? 1;
    let q = supabase
      .from("orders")
      .select(
        `id, order_number, status, total_kobo, customer_id, paystack_reference,
         created_at, paid_at, shipping_snapshot,
         items:order_items(id, product_title, vendor_id, quantity, unit_price_kobo, status)`,
        { count: "exact" },
      )
      .order("created_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, count, error } = await q.range(
      (page - 1) * pageSize,
      page * pageSize - 1,
    );
    if (error) throw new Error(error.message);
    return { orders: rows ?? [], total: count ?? 0, page, pageSize };
  });

const updateStatusSchema = z.object({
  order_id: z.string().uuid(),
  status: z.enum(["pending", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"]),
});

export const updateOrderStatusAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateStatusSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "paid") patch.paid_at = new Date().toISOString();
    const { error } = await supabase.from("orders").update(patch).eq("id", data.order_id);
    if (error) throw new Error(error.message);
    // cascade item status to keep dashboards in sync
    await supabase
      .from("order_items")
      .update({ status: data.status })
      .eq("order_id", data.order_id);
    return { success: true };
  });
