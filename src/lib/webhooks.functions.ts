/**
 * Admin-only: returns Paystack webhook receipt stats from
 * `payment_webhook_events` so admins can verify deliveries.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PaystackWebhookStatus {
  configured: boolean;
  total: number;
  last24h: number;
  processed: number;
  unprocessed: number;
  lastEvent: {
    event_type: string;
    reference: string | null;
    received_at: string;
    processed_at: string | null;
  } | null;
  recent: Array<{
    id: string;
    event_type: string;
    reference: string | null;
    received_at: string;
    processed_at: string | null;
  }>;
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

export const getPaystackWebhookStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaystackWebhookStatus> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    // Check secret presence
    const { data: secretRow } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "PAYSTACK_WEBHOOK_SECRET")
      .maybeSingle();
    const configured = !!(secretRow?.value && String(secretRow.value).length > 0);

    const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ count: total }, { count: last24h }, { count: processed }, recentRes] =
      await Promise.all([
        supabase
          .from("payment_webhook_events")
          .select("id", { count: "exact", head: true })
          .eq("provider", "paystack"),
        supabase
          .from("payment_webhook_events")
          .select("id", { count: "exact", head: true })
          .eq("provider", "paystack")
          .gte("received_at", since24),
        supabase
          .from("payment_webhook_events")
          .select("id", { count: "exact", head: true })
          .eq("provider", "paystack")
          .not("processed_at", "is", null),
        supabase
          .from("payment_webhook_events")
          .select("id, event_type, reference, received_at, processed_at")
          .eq("provider", "paystack")
          .order("received_at", { ascending: false })
          .limit(5),
      ]);

    const recent = (recentRes.data ?? []) as PaystackWebhookStatus["recent"];
    const t = total ?? 0;
    const p = processed ?? 0;
    return {
      configured,
      total: t,
      last24h: last24h ?? 0,
      processed: p,
      unprocessed: Math.max(0, t - p),
      lastEvent: recent[0]
        ? {
            event_type: recent[0].event_type,
            reference: recent[0].reference,
            received_at: recent[0].received_at,
            processed_at: recent[0].processed_at,
          }
        : null,
      recent,
    };
  });
