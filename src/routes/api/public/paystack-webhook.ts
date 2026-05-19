/**
 * Paystack webhook receiver.
 * - HMAC-SHA512 signature verification
 * - Per-IP sliding window rate limit (db-backed)
 * - Idempotent event log
 * - Atomic stock decrement via RPC
 * - Ledger credit happens via DB trigger on orders.status='paid'
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPlatformValue } from "@/lib/platform-settings.server";
import { sendOrderReceipt, sendPayoutPaidEmail } from "@/lib/email.server";

const RATE_LIMIT_PER_MIN = 120;

export const Route = createFileRoute("/api/public/paystack-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Rate-limit per source IP (cheap, db-backed sliding window)
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        const { data: hit } = await supabaseAdmin.rpc("bump_rate_limit", {
          _key: `paystack-webhook:${ip}`,
          _window_seconds: 60,
        });
        if (typeof hit === "number" && hit > RATE_LIMIT_PER_MIN) {
          return new Response("Rate limit exceeded", { status: 429 });
        }

        const raw = await request.text();
        const sigHeader = request.headers.get("x-paystack-signature") ?? "";

        const secret =
          (await getPlatformValue("PAYSTACK_WEBHOOK_SECRET")) ||
          (await getPlatformValue("PAYSTACK_SECRET_KEY"));
        if (!secret) {
          return new Response("Paystack secret not configured", { status: 500 });
        }

        const expected = createHmac("sha512", secret).update(raw).digest("hex");
        let ok = false;
        try {
          ok =
            sigHeader.length === expected.length &&
            timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));
        } catch {
          ok = false;
        }
        if (!ok) return new Response("Invalid signature", { status: 401 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let body: any;
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const eventType: string = body?.event ?? "unknown";
        const reference: string | undefined = body?.data?.reference;
        const eventId = String(
          body?.data?.id ?? `${eventType}-${reference}-${Date.now()}`,
        );

        // Resolve order before logging
        let orderId: string | null = null;
        if (reference) {
          const { data: o } = await supabaseAdmin
            .from("orders")
            .select("id")
            .eq("paystack_reference", reference)
            .maybeSingle();
          orderId = (o?.id as string | undefined) ?? null;
        }

        const { error: logErr } = await supabaseAdmin
          .from("payment_webhook_events")
          .insert({
            provider: "paystack",
            event_id: eventId,
            event_type: eventType,
            reference: reference ?? null,
            order_id: orderId,
            payload: body,
            signature: sigHeader,
          });
        if (logErr && !/duplicate key/i.test(logErr.message)) {
          // eslint-disable-next-line no-console
          console.error("[paystack-webhook] log insert failed", logErr.message);
        }
        // If duplicate, this is a retry — short-circuit
        if (logErr && /duplicate key/i.test(logErr.message)) {
          return new Response(JSON.stringify({ duplicate: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // ----- charge.success: mark paid + decrement stock atomically -----
        if (eventType === "charge.success" && orderId) {
          const { data: order } = await supabaseAdmin
            .from("orders")
            .select("id, status, total_kobo")
            .eq("id", orderId)
            .maybeSingle();
          if (order && order.status !== "paid") {
            // 1. Atomic stock decrement (returns # failed items)
            const { data: failed } = await supabaseAdmin.rpc(
              "decrement_stock_for_order",
              { _order_id: orderId },
            );
            if (typeof failed === "number" && failed > 0) {
              // Don't mark paid — payment will need to be refunded manually
              await supabaseAdmin
                .from("payment_webhook_events")
                .update({
                  error: `Stock decrement failed for ${failed} items; payment captured but order held`,
                })
                .eq("event_id", eventId);
              return new Response(
                JSON.stringify({ received: true, held: true, failed_items: failed }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              );
            }

            // 2. Mark paid — trigger credits vendor_ledger
            await supabaseAdmin
              .from("orders")
              .update({ status: "paid", paid_at: new Date().toISOString() })
              .eq("id", orderId);
            await supabaseAdmin.from("payments").insert({
              order_id: orderId,
              provider: "paystack",
              provider_reference: reference ?? eventId,
              amount_kobo: body?.data?.amount ?? order.total_kobo,
              status: "success",
              raw: body,
            });
            await supabaseAdmin
              .from("payment_webhook_events")
              .update({ processed_at: new Date().toISOString() })
              .eq("event_id", eventId);

            // 3. Email buyer receipt (best-effort, never blocks webhook)
            try {
              const { data: full } = await supabaseAdmin
                .from("orders")
                .select(
                  "id, order_number, total_kobo, customer_id, items:order_items(product_title, quantity, unit_price_kobo)",
                )
                .eq("id", orderId)
                .maybeSingle();
              const buyerEmail = body?.data?.customer?.email as string | undefined;
              if (full && buyerEmail) {
                const origin = new URL(request.url).origin;
                await sendOrderReceipt({
                  to: buyerEmail,
                  orderNumber: String(full.order_number ?? full.id),
                  totalKobo: Number(full.total_kobo),
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  items: ((full.items as any[]) ?? []).map((i) => ({
                    title: i.product_title,
                    qty: i.quantity,
                    unitKobo: i.unit_price_kobo,
                  })),
                  orderId: full.id,
                  appOrigin: origin,
                });
              }
            } catch (e) {
              console.error("[paystack-webhook] receipt email failed", e);
            }
          }
        }

        // ----- transfer.success / transfer.failed: mark payout -----
        if (eventType === "transfer.success" || eventType === "transfer.failed") {
          const transferRef: string | undefined =
            body?.data?.reference ?? body?.data?.transfer_code;
          if (transferRef) {
            const { data: payout } = await supabaseAdmin
              .from("payout_requests")
              .select("id, vendor_id, amount_kobo, status")
              .or(
                `paystack_transfer_ref.eq.${transferRef},paystack_transfer_code.eq.${transferRef}`,
              )
              .maybeSingle();
            if (payout) {
              if (eventType === "transfer.success" && payout.status !== "paid") {
                // Atomic transition: only one webhook delivery can flip
                // status from non-paid → paid. Subsequent retries see
                // status='paid' and skip ledger insertion entirely.
                const { data: updated, error: upErr } = await supabaseAdmin
                  .from("payout_requests")
                  .update({
                    status: "paid",
                    processed_at: new Date().toISOString(),
                  })
                  .eq("id", payout.id)
                  .neq("status", "paid")
                  .select("id")
                  .maybeSingle();
                if (!upErr && updated) {
                  await supabaseAdmin.from("vendor_ledger").insert({
                    vendor_id: payout.vendor_id,
                    entry_type: "payout",
                    amount_kobo: -Math.abs(payout.amount_kobo),
                    payout_id: payout.id,
                    note: `Paystack transfer ${transferRef}`,
                  });
                  // Email vendor owner
                  try {
                    const { data: v } = await supabaseAdmin
                      .from("vendors")
                      .select("business_name, store_name, owner_id")
                      .eq("id", payout.vendor_id)
                      .maybeSingle();
                    if (v?.owner_id) {
                      const { data: u } = await supabaseAdmin
                        .from("profiles")
                        .select("email")
                        .eq("id", v.owner_id)
                        .maybeSingle();
                      if (u?.email) {
                        await sendPayoutPaidEmail({
                          to: u.email,
                          amountKobo: payout.amount_kobo,
                          reference: transferRef,
                          vendorName: v.business_name ?? v.store_name ?? undefined,
                        });
                      }
                    }
                  } catch (e) {
                    console.error("[paystack-webhook] payout email failed", e);
                  }
                }

              } else if (eventType === "transfer.failed") {
                await supabaseAdmin
                  .from("payout_requests")
                  .update({
                    status: "failed",
                    failure_reason:
                      body?.data?.reason ?? body?.data?.failure_reason ?? "Transfer failed",
                  })
                  .eq("id", payout.id);
              }
              await supabaseAdmin
                .from("payment_webhook_events")
                .update({ processed_at: new Date().toISOString() })
                .eq("event_id", eventId);
            }
          }
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
