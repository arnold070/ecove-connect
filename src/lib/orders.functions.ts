/**
 * Buyer-facing order detail + confirm delivery + refund request.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendRefundDecisionEmail } from "./email.server";

export const getMyOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: order, error } = await supabase
      .from("orders")
      .select(
        `id, order_number, status, subtotal_kobo, shipping_kobo, discount_kobo, total_kobo,
         paystack_reference, shipping_snapshot, created_at, paid_at, customer_id,
         items:order_items(
           id, product_id, product_title, quantity, unit_price_kobo,
           fulfillment_status, status, tracking_carrier, tracking_ref,
           shipped_at, delivered_at, refunded_at, vendor_id
         )`,
      )
      .eq("id", data.order_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Order not found");
    if (order.customer_id !== userId) throw new Error("Forbidden");

    // Fetch refund requests for items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemIds = (order.items as any[] | undefined ?? []).map((i) => i.id);
    let refunds: Array<{
      id: string;
      order_item_id: string;
      status: string;
      reason: string;
      created_at: string;
      updated_at: string | null;
      processed_at: string | null;
      admin_note: string | null;
    }> = [];
    if (itemIds.length) {
      const { data: rfs } = await supabase
        .from("refund_requests")
        .select("id, order_item_id, status, reason, created_at, updated_at, processed_at, admin_note")
        .in("order_item_id", itemIds);
      refunds = rfs ?? [];
    }

    return { order, refunds };
  });

export const confirmDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ order_item_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // RLS already restricts to buyer's items, but double-check
    const { data: item, error: iErr } = await supabase
      .from("order_items")
      .select("id, fulfillment_status, order:orders!inner(customer_id)")
      .eq("id", data.order_item_id)
      .maybeSingle();
    if (iErr) throw new Error(iErr.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!item || (item.order as any)?.customer_id !== userId)
      throw new Error("Forbidden");
    if (!["shipped", "processing"].includes(item.fulfillment_status))
      throw new Error("Item not in a confirmable state");
    const { error } = await supabase
      .from("order_items")
      .update({
        fulfillment_status: "delivered",
        status: "delivered",
        delivered_at: new Date().toISOString(),
      })
      .eq("id", data.order_item_id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

const refundSchema = z.object({
  order_item_id: z.string().uuid(),
  reason: z.string().min(5).max(1000),
});

export const requestRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => refundSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("refund_requests")
      .insert({
        order_item_id: data.order_item_id,
        buyer_id: userId,
        reason: data.reason,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

// ---------------------------------------------------------------------------
// Admin: refund queue
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const listRefundsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("refund_requests")
      .select(
        `id, reason, status, admin_note, created_at, buyer_id,
         item:order_items!inner(
           id, product_title, quantity, unit_price_kobo, vendor_payout_kobo,
           order:orders!inner(id, order_number)
         )`,
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { refunds: data ?? [] };
  });

const decideRefundSchema = z.object({
  id: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().max(500).optional(),
});

export const decideRefundAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => decideRefundSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: rf, error: rErr } = await supabase
      .from("refund_requests")
      .select("id, order_item_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!rf) throw new Error("Refund request not found");
    if (rf.status !== "requested") throw new Error("Already decided");

    // Fetch context for buyer email
    const { data: item } = await supabase
      .from("order_items")
      .select(
        "product_title, vendor_payout_kobo, unit_price_kobo, quantity, order:orders!inner(customer_id)",
      )
      .eq("id", rf.order_item_id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buyerId = (item?.order as any)?.customer_id as string | undefined;
    let buyerEmail: string | undefined;
    if (buyerId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", buyerId)
        .maybeSingle();
      buyerEmail = prof?.email ?? undefined;
    }
    const refundAmount = item ? Number(item.unit_price_kobo) * Number(item.quantity) : 0;

    if (!data.approve) {
      await supabase
        .from("refund_requests")
        .update({
          status: "rejected",
          admin_note: data.note ?? null,
          processed_by: userId,
          processed_at: new Date().toISOString(),
        })
        .eq("id", data.id);
      if (buyerEmail && item) {
        await sendRefundDecisionEmail({
          to: buyerEmail,
          approved: false,
          productTitle: item.product_title,
          amountKobo: refundAmount,
          note: data.note,
        }).catch(() => undefined);
      }
      return { success: true, status: "rejected" };
    }

    // Approve -> call RPC to atomically restock + reverse ledger
    const { error: rpcErr } = await supabase.rpc("refund_order_item", {
      _order_item_id: rf.order_item_id,
      _note: data.note ?? null,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    await supabase
      .from("refund_requests")
      .update({
        status: "refunded",
        admin_note: data.note ?? null,
        processed_by: userId,
        processed_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    if (buyerEmail && item) {
      await sendRefundDecisionEmail({
        to: buyerEmail,
        approved: true,
        productTitle: item.product_title,
        amountKobo: refundAmount,
        note: data.note,
      }).catch(() => undefined);
    }
    return { success: true, status: "refunded" };
  });
