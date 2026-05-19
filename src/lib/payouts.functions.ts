/**
 * Vendor payouts + ledger + fulfillment transitions.
 *
 * Money flow:
 *   order.paid    -> trigger inserts 'sale' ledger rows (vendor_payout_kobo)
 *   refund        -> refund_order_item() restocks + inserts negative 'refund'
 *   payout paid   -> insert negative 'payout' row equal to amount
 * vendor_balance(_vendor_id) = SUM(ledger)
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPlatformValue } from "./platform-settings.server";
import { sendPayoutPaidEmail } from "./email.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function emailVendorPayoutPaid(supabase: any, vendorId: string, amountKobo: number, reference: string | null) {
  try {
    const { data: v } = await supabase
      .from("vendors")
      .select("business_name, store_name, owner_id")
      .eq("id", vendorId)
      .maybeSingle();
    if (!v?.owner_id) return;
    const { data: u } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", v.owner_id)
      .maybeSingle();
    if (!u?.email) return;
    await sendPayoutPaidEmail({
      to: u.email,
      amountKobo,
      reference,
      vendorName: v.business_name ?? v.store_name ?? undefined,
    });
  } catch (e) {
    console.error("[payouts] email failed", e);
  }
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
  if (!data) throw new Error("Vendor profile not found");
  return data as { id: string; status: string };
}

// ---------------------------------------------------------------------------
// Vendor: earnings dashboard
// ---------------------------------------------------------------------------
export const getMyEarnings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const vendor = await getMyVendorOrThrow(supabase, userId);

    const { data: balanceData, error: balErr } = await supabase.rpc("vendor_balance", {
      _vendor_id: vendor.id,
    });
    if (balErr) throw new Error(balErr.message);

    const { data: ledger } = await supabase
      .from("vendor_ledger")
      .select("id, entry_type, amount_kobo, note, created_at, order_item_id, payout_id")
      .eq("vendor_id", vendor.id)
      .order("created_at", { ascending: false })
      .limit(100);

    const { data: pendingPayouts } = await supabase
      .from("payout_requests")
      .select("id, amount_kobo, status, created_at")
      .eq("vendor_id", vendor.id)
      .in("status", ["requested", "approved", "processing"])
      .order("created_at", { ascending: false });

    const pendingTotal =
      (pendingPayouts ?? []).reduce(
        (a: number, p: { amount_kobo: number }) => a + Number(p.amount_kobo),
        0,
      ) ?? 0;

    return {
      vendor_id: vendor.id,
      balance_kobo: Number(balanceData ?? 0),
      pending_payout_kobo: pendingTotal,
      available_kobo: Number(balanceData ?? 0) - pendingTotal,
      ledger: ledger ?? [],
    };
  });

// ---------------------------------------------------------------------------
// Vendor: request payout
// ---------------------------------------------------------------------------
const reqSchema = z.object({
  amount_kobo: z.number().int().positive().max(1_000_000_000),
  bank_name: z.string().min(1).max(120).optional(),
  bank_code: z.string().min(1).max(20).optional(),
  account_number: z.string().min(6).max(20).optional(),
  account_name: z.string().min(1).max(120).optional(),
});

export const requestPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reqSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendor = await getMyVendorOrThrow(supabase, userId);
    if (vendor.status !== "approved")
      throw new Error("Vendor must be approved before requesting payouts");

    const minRaw = await getPlatformValue("PAYOUT_MIN_KOBO");
    const min = Math.max(0, Number(minRaw) || 100_000);
    if (data.amount_kobo < min)
      throw new Error(`Minimum payout is ${min / 100} NGN`);

    const { data: balRpc, error: balErr } = await supabase.rpc("vendor_balance", {
      _vendor_id: vendor.id,
    });
    if (balErr) throw new Error(balErr.message);
    const { data: pending } = await supabase
      .from("payout_requests")
      .select("amount_kobo")
      .eq("vendor_id", vendor.id)
      .in("status", ["requested", "approved", "processing"]);
    const pendingTotal = (pending ?? []).reduce(
      (a: number, p: { amount_kobo: number }) => a + Number(p.amount_kobo),
      0,
    );
    const available = Number(balRpc ?? 0) - pendingTotal;
    if (data.amount_kobo > available)
      throw new Error(`Available balance is ${available / 100} NGN`);

    const { data: row, error } = await supabase
      .from("payout_requests")
      .insert({
        vendor_id: vendor.id,
        amount_kobo: data.amount_kobo,
        bank_name: data.bank_name,
        bank_code: data.bank_code,
        account_number: data.account_number,
        account_name: data.account_name,
        requested_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const cancelPayoutRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("payout_requests")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("status", "requested");
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Admin: payouts review queue + approve/reject (calls Paystack Transfer if enabled)
// ---------------------------------------------------------------------------
export const listPayoutsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z
          .enum(["requested", "approved", "processing", "paid", "failed", "rejected", "cancelled"])
          .optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    let q = supabase
      .from("payout_requests")
      .select(
        `id, vendor_id, amount_kobo, status, bank_name, account_number, account_name,
         paystack_transfer_ref, failure_reason, created_at, processed_at,
         vendor:vendors!inner(id, business_name, slug, owner_id)`,
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { payouts: rows ?? [] };
  });

const decisionSchema = z.object({
  id: z.string().uuid(),
  note: z.string().max(500).optional(),
});

export const rejectPayoutAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => decisionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("payout_requests")
      .update({
        status: "rejected",
        failure_reason: data.note,
        processed_by: userId,
        processed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .in("status", ["requested", "approved", "processing"]);
    if (error) throw new Error(error.message);
    return { success: true };
  });

/**
 * Approve & pay a payout. If PAYSTACK_TRANSFER_ENABLED is true, creates a
 * Paystack recipient + transfer; otherwise marks paid manually. Always
 * inserts a negative 'payout' ledger row so balance reflects the deduction.
 */
export const approvePayoutAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => decisionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: payout, error: pErr } = await supabase
      .from("payout_requests")
      .select("id, vendor_id, amount_kobo, status, bank_code, account_number, account_name, paystack_recipient_code")
      .eq("id", data.id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!payout) throw new Error("Payout not found");
    if (!["requested", "approved"].includes(payout.status))
      throw new Error(`Cannot approve from status '${payout.status}'`);

    const transferEnabledRaw = await getPlatformValue("PAYSTACK_TRANSFER_ENABLED");
    const transferEnabled = String(transferEnabledRaw ?? "").toLowerCase() === "true";

    let transferRef: string | null = null;
    let transferCode: string | null = null;
    let recipientCode: string | null = payout.paystack_recipient_code ?? null;

    if (transferEnabled) {
      const secret = await getPlatformValue("PAYSTACK_SECRET_KEY");
      if (!secret) throw new Error("PAYSTACK_SECRET_KEY not configured");
      if (!payout.bank_code || !payout.account_number || !payout.account_name)
        throw new Error("Vendor bank details missing");

      // 1. Create recipient (if not cached)
      if (!recipientCode) {
        const rRes = await fetch("https://api.paystack.co/transferrecipient", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "nuban",
            name: payout.account_name,
            account_number: payout.account_number,
            bank_code: payout.bank_code,
            currency: "NGN",
          }),
        });
        const rJson = (await rRes.json().catch(() => ({}))) as {
          status?: boolean;
          message?: string;
          data?: { recipient_code?: string };
        };
        if (!rRes.ok || !rJson.status || !rJson.data?.recipient_code)
          throw new Error(`Recipient create failed: ${rJson.message ?? rRes.statusText}`);
        recipientCode = rJson.data.recipient_code;
      }

      // 2. Initiate transfer
      const reference = `PO-${payout.id.slice(0, 8)}-${Date.now()}`;
      const tRes = await fetch("https://api.paystack.co/transfer", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "balance",
          amount: payout.amount_kobo,
          recipient: recipientCode,
          reference,
          reason: data.note ?? `Payout ${payout.id}`,
        }),
      });
      const tJson = (await tRes.json().catch(() => ({}))) as {
        status?: boolean;
        message?: string;
        data?: { transfer_code?: string; reference?: string; status?: string };
      };
      if (!tRes.ok || !tJson.status)
        throw new Error(`Transfer failed: ${tJson.message ?? tRes.statusText}`);
      transferCode = tJson.data?.transfer_code ?? null;
      transferRef = tJson.data?.reference ?? reference;

      // Paystack transfer status: 'success' (instant) or 'pending'/'otp' -> processing
      const paystackStatus = tJson.data?.status ?? "pending";
      const newStatus = paystackStatus === "success" ? "paid" : "processing";

      await supabase
        .from("payout_requests")
        .update({
          status: newStatus,
          paystack_recipient_code: recipientCode,
          paystack_transfer_code: transferCode,
          paystack_transfer_ref: transferRef,
          processed_by: userId,
          processed_at: new Date().toISOString(),
        })
        .eq("id", payout.id);

      // Only credit ledger debit when paid
      if (newStatus === "paid") {
        await supabase.from("vendor_ledger").insert({
          vendor_id: payout.vendor_id,
          entry_type: "payout",
          amount_kobo: -Math.abs(payout.amount_kobo),
          payout_id: payout.id,
          note: `Payout ${transferRef}`,
        });
        await emailVendorPayoutPaid(supabase, payout.vendor_id, payout.amount_kobo, transferRef);
      }
      return { success: true, status: newStatus, transfer_ref: transferRef };
    }

    // Manual mode
    await supabase
      .from("payout_requests")
      .update({
        status: "paid",
        processed_by: userId,
        processed_at: new Date().toISOString(),
        failure_reason: data.note ?? null,
      })
      .eq("id", payout.id);
    await supabase.from("vendor_ledger").insert({
      vendor_id: payout.vendor_id,
      entry_type: "payout",
      amount_kobo: -Math.abs(payout.amount_kobo),
      payout_id: payout.id,
      note: `Manual payout`,
    });
    await emailVendorPayoutPaid(supabase, payout.vendor_id, payout.amount_kobo, null);
    return { success: true, status: "paid", transfer_ref: null };
  });

// ---------------------------------------------------------------------------
// Vendor: fulfillment transitions
// ---------------------------------------------------------------------------
const shipSchema = z.object({
  order_item_id: z.string().uuid(),
  tracking_carrier: z.string().min(1).max(80).optional(),
  tracking_ref: z.string().min(1).max(120).optional(),
});

export const markItemShipped = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => shipSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("order_items")
      .update({
        fulfillment_status: "shipped",
        status: "shipped",
        tracking_carrier: data.tracking_carrier,
        tracking_ref: data.tracking_ref,
        shipped_at: new Date().toISOString(),
      })
      .eq("id", data.order_item_id)
      .in("fulfillment_status", ["pending", "processing"]);
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const markItemDelivered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ order_item_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("order_items")
      .update({
        fulfillment_status: "delivered",
        status: "delivered",
        delivered_at: new Date().toISOString(),
      })
      .eq("id", data.order_item_id)
      .eq("fulfillment_status", "shipped");
    if (error) throw new Error(error.message);
    return { success: true };
  });

// Vendor view of own order items
export const listMyVendorOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const vendor = await getMyVendorOrThrow(supabase, userId);
    const { data, error } = await supabase
      .from("order_items")
      .select(
        `id, product_title, quantity, unit_price_kobo, vendor_payout_kobo,
         fulfillment_status, tracking_carrier, tracking_ref, shipped_at, delivered_at, created_at,
         order:orders!inner(id, order_number, status, customer_id, shipping_snapshot, paid_at)`,
      )
      .eq("vendor_id", vendor.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });
