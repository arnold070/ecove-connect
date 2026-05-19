/**
 * Paystack webhook receiver.
 * Verifies x-paystack-signature (HMAC-SHA512 of raw body with the secret),
 * deduplicates by event_id (data.id from Paystack), and marks the
 * corresponding order as `paid` on `charge.success`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPlatformValue } from "@/lib/platform-settings.server";

export const Route = createFileRoute("/api/public/paystack-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

        const eventType = body?.event ?? "unknown";
        const reference: string | undefined = body?.data?.reference;
        const eventId = String(body?.data?.id ?? `${eventType}-${reference}-${Date.now()}`);

        // Resolve order before logging so we can attach it
        let orderId: string | null = null;
        if (reference) {
          const { data: o } = await supabaseAdmin
            .from("orders")
            .select("id")
            .eq("paystack_reference", reference)
            .maybeSingle();
          orderId = (o?.id as string | undefined) ?? null;
        }

        // Idempotent log insert (unique on provider+event_id)
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
          // log table failure is non-fatal but worth a 500 for retry
          // eslint-disable-next-line no-console
          console.error("[paystack-webhook] log insert failed", logErr.message);
        }

        // Replay-safe: only act on charge.success once per order
        if (eventType === "charge.success" && orderId) {
          const { data: order } = await supabaseAdmin
            .from("orders")
            .select("id, status, total_kobo")
            .eq("id", orderId)
            .maybeSingle();
          if (order && order.status !== "paid") {
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
