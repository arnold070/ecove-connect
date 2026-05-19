/**
 * Buyer-facing order detail + confirm delivery + refund request.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendRefundDecisionEmail, sendVendorRefundEmail, type RefundEmailStatus } from "./email.server";

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
      refunds = (rfs ?? []) as typeof refunds;
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

const refundFilterSchema = z
  .object({
    status: z
      .enum(["requested", "approved", "rejected", "refunded", "cancelled"])
      .optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    order_number: z.string().trim().min(1).max(100).optional(),
    buyer_email: z.string().trim().min(1).max(255).optional(),
    query: z.string().trim().min(1).max(255).optional(),
  })
  .optional();

type AdminRefundRow = {
  id: string;
  reason: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  updated_at: string | null;
  processed_at: string | null;
  buyer_id: string;
  buyer_email?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: any;
};

async function queryAdminRefunds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  filters: z.infer<typeof refundFilterSchema>,
  limit = 200,
) {
  let q = supabase
    .from("refund_requests")
    .select(
      `id, reason, status, admin_note, created_at, updated_at, processed_at, buyer_id,
       item:order_items!inner(
         id, product_title, quantity, unit_price_kobo, vendor_payout_kobo,
         order:orders!inner(id, order_number)
       )`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.from) q = q.gte("created_at", filters.from);
  if (filters?.to) q = q.lte("created_at", filters.to);
  if (filters?.order_number) {
    q = q.ilike("item.order.order_number", `%${filters.order_number}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as AdminRefundRow[];

  if (filters?.buyer_email || filters?.query) {
    const buyerIds = Array.from(
      new Set(rows.map((r) => r.buyer_id).filter(Boolean)),
    );
    if (buyerIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", buyerIds);
      const emailById = new Map<string, string>(
        (profs ?? []).map((p: { id: string; email: string | null }) => [p.id, p.email ?? ""]),
      );
      for (const r of rows) {
        r.buyer_email = emailById.get(r.buyer_id) ?? null;
      }
      if (filters.buyer_email) {
        const needle = filters.buyer_email.toLowerCase();
        rows = rows.filter((r) =>
          String(r.buyer_email ?? "").toLowerCase().includes(needle),
        );
      }
      if (filters.query) {
        const needle = filters.query.toLowerCase();
        rows = rows.filter((r) => {
          const it = r.item;
          return (
            String(it?.order?.order_number ?? "").toLowerCase().includes(needle) ||
            String(it?.product_title ?? "").toLowerCase().includes(needle) ||
            String(r.buyer_email ?? "").toLowerCase().includes(needle) ||
            String(r.reason ?? "").toLowerCase().includes(needle)
          );
        });
      }
    }
  }
  return rows;
}

export const listRefundsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ filters: refundFilterSchema }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const refunds = await queryAdminRefunds(supabase, data.filters);
    return { refunds };
  });

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const exportRefundsCsvAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ filters: refundFilterSchema }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    // Force buyer email resolution by injecting an always-true query when none provided.
    const filters = { ...(data.filters ?? {}), query: data.filters?.query ?? " " };
    const rows = await queryAdminRefunds(supabase, filters, 5000);
    const header = [
      "refund_id",
      "status",
      "created_at",
      "updated_at",
      "processed_at",
      "order_number",
      "buyer_email",
      "product_title",
      "quantity",
      "amount_kobo",
      "amount_naira",
      "admin_note",
      "reason",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const it = (r as any).item;
      const qty = Number(it?.quantity ?? 0);
      const unit = Number(it?.unit_price_kobo ?? 0);
      const amountKobo = qty * unit;
      lines.push(
        [
          r.id,
          r.status,
          r.created_at,
          r.updated_at ?? "",
          r.processed_at ?? "",
          it?.order?.order_number ?? "",
          (r as { buyer_email?: string | null }).buyer_email ?? "",
          it?.product_title ?? "",
          qty,
          amountKobo,
          (amountKobo / 100).toFixed(2),
          r.admin_note ?? "",
          r.reason ?? "",
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    return {
      csv: lines.join("\n"),
      count: rows.length,
      filename: `refunds-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  });

const decideRefundSchema = z.object({
  id: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().max(500).optional(),
});

async function loadRefundContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  refundId: string,
): Promise<{
  buyerEmail?: string;
  vendorEmail?: string;
  productTitle?: string;
  amountKobo: number;
  reference?: string | null;
  orderNumber?: string | null;
}> {
  const { data: rf } = await supabase
    .from("refund_requests")
    .select("order_item_id")
    .eq("id", refundId)
    .maybeSingle();
  if (!rf) return { amountKobo: 0 };
  const { data: item } = await supabase
    .from("order_items")
    .select(
      `product_title, unit_price_kobo, quantity, vendor_id,
       order:orders!inner(customer_id, paystack_reference, order_number),
       vendor:vendors!inner(owner_id)`,
    )
    .eq("id", rf.order_item_id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ord = item?.order as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vnd = item?.vendor as any;
  let buyerEmail: string | undefined;
  let vendorEmail: string | undefined;
  const ownerIds: string[] = [];
  if (ord?.customer_id) ownerIds.push(ord.customer_id);
  if (vnd?.owner_id) ownerIds.push(vnd.owner_id);
  if (ownerIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", ownerIds);
    for (const p of profs ?? []) {
      if (p.id === ord?.customer_id) buyerEmail = p.email ?? undefined;
      if (p.id === vnd?.owner_id) vendorEmail = p.email ?? undefined;
    }
  }
  return {
    buyerEmail,
    vendorEmail,
    productTitle: item?.product_title,
    amountKobo: item ? Number(item.unit_price_kobo) * Number(item.quantity) : 0,
    reference: ord?.paystack_reference ?? null,
    orderNumber: ord?.order_number ?? null,
  };
}

async function notifyRefundParties(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  refundId: string,
  status: RefundEmailStatus,
  note?: string | null,
) {
  const ctx = await loadRefundContext(supabase, refundId);
  if (!ctx.productTitle) return;
  if (ctx.buyerEmail) {
    await sendRefundDecisionEmail({
      to: ctx.buyerEmail,
      status,
      productTitle: ctx.productTitle,
      amountKobo: ctx.amountKobo,
      note,
      reference: ctx.reference,
    }).catch(() => undefined);
  }
  if (ctx.vendorEmail) {
    await sendVendorRefundEmail({
      to: ctx.vendorEmail,
      status,
      productTitle: ctx.productTitle,
      amountKobo: ctx.amountKobo,
      orderNumber: ctx.orderNumber,
      buyerEmail: ctx.buyerEmail,
      note,
    }).catch(() => undefined);
  }
}

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
      await notifyRefundParties(supabase, data.id, "rejected", data.note);
      return { success: true, status: "rejected" };
    }

    // Approve -> RPC restocks + reverses ledger atomically
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

    await notifyRefundParties(supabase, data.id, "approved", data.note);
    return { success: true, status: "refunded" };
  });

// Buyer-initiated cancellation of their own pending refund request.
export const cancelMyRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rf, error } = await supabase
      .from("refund_requests")
      .update({ status: "cancelled", processed_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("buyer_id", userId)
      .eq("status", "requested")
      .select("id, order_item_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!rf) throw new Error("Refund not found or already decided");

    await notifyRefundParties(supabase, data.id, "cancelled");
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Vendor-facing: refunds on the vendor's own items.
// RLS (refund_request_owner_read) already restricts to refunds on items
// owned by vendors whose owner_id = auth.uid().
// ---------------------------------------------------------------------------
export const listMyVendorRefunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("refund_requests")
      .select(
        `id, reason, status, admin_note, created_at, updated_at, processed_at,
         item:order_items!inner(
           id, product_title, quantity, unit_price_kobo, vendor_payout_kobo,
           vendor:vendors!inner(owner_id),
           order:orders!inner(id, order_number)
         )`,
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { refunds: data ?? [] };
  });
