/**
 * Transactional email helper backed by Resend, using the admin-supplied
 * RESEND_API_KEY and RESEND_FROM_EMAIL from platform_settings. SERVER ONLY.
 *
 * All functions no-op (and log) when the key is missing so receipts never
 * break checkout / payout flows.
 */
import { getPlatformValue } from "./platform-settings.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail({ to, subject, html }: SendArgs): Promise<{
  ok: boolean;
  id?: string;
  error?: string;
}> {
  const apiKey = await getPlatformValue("RESEND_API_KEY");
  const from =
    (await getPlatformValue("RESEND_FROM_EMAIL")) || "ecove <onboarding@resend.dev>";
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!res.ok) {
      const error = json.message ?? res.statusText;
      await logSend({ to, subject, status: "failed", error });
      return { ok: false, error };
    }
    await logSend({ to, subject, status: "sent", message_id: json.id });
    return { ok: true, id: json.id };
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown";
    await logSend({ to, subject, status: "failed", error });
    return { ok: false, error };
  }
}

async function logSend(row: {
  to: string;
  subject: string;
  status: "sent" | "failed";
  message_id?: string;
  error?: string;
}) {
  try {
    await supabaseAdmin.from("email_send_log").insert({
      recipient_email: row.to,
      template_name: row.subject.slice(0, 80),
      status: row.status,
      message_id: row.message_id ?? null,
      error_message: row.error ?? null,
    });
  } catch {
    /* table optional */
  }
}

// ---------------------------------------------------------------------------
// Templates (inline HTML — small, brand-consistent)
// ---------------------------------------------------------------------------
const BRAND = { name: "ecove", primary: "#0F766E" };

function shell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#fff;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:24px">
      <tr><td>
        <div style="font-weight:800;color:${BRAND.primary};font-size:18px;margin-bottom:18px">${BRAND.name}</div>
        <h1 style="font-size:20px;margin:0 0 14px">${title}</h1>
        ${body}
        <p style="color:#888;font-size:12px;margin-top:32px">
          You're receiving this because of activity on your ${BRAND.name} account.
        </p>
      </td></tr>
    </table>
  </body></html>`;
}

function fmtNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

export async function sendOrderReceipt(args: {
  to: string;
  orderNumber: string;
  totalKobo: number;
  items: Array<{ title: string; qty: number; unitKobo: number }>;
  orderId: string;
  appOrigin?: string;
}) {
  const rows = args.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0">${escapeHtml(i.title)} × ${i.qty}</td><td align="right">${fmtNaira(i.unitKobo * i.qty)}</td></tr>`,
    )
    .join("");
  const link = args.appOrigin
    ? `<p><a href="${args.appOrigin}/account/orders/${args.orderId}" style="color:${BRAND.primary}">View order</a></p>`
    : "";
  return sendEmail({
    to: args.to,
    subject: `Order ${args.orderNumber} confirmed`,
    html: shell(
      `Thanks — your order ${args.orderNumber} is confirmed`,
      `<p>We're processing your order. You'll get another email when items ship.</p>
       <table width="100%" style="border-top:1px solid #eee;border-bottom:1px solid #eee;margin:14px 0">
         ${rows}
         <tr><td style="padding:10px 0;font-weight:700">Total</td><td align="right" style="font-weight:700">${fmtNaira(args.totalKobo)}</td></tr>
       </table>
       ${link}`,
    ),
  });
}

export async function sendPayoutPaidEmail(args: {
  to: string;
  amountKobo: number;
  reference: string | null;
  vendorName?: string;
}) {
  return sendEmail({
    to: args.to,
    subject: `Payout paid — ${fmtNaira(args.amountKobo)}`,
    html: shell(
      `Your payout has been sent`,
      `<p>Hi${args.vendorName ? ` ${escapeHtml(args.vendorName)}` : ""}, your payout of
       <strong>${fmtNaira(args.amountKobo)}</strong> has been disbursed.</p>
       ${args.reference ? `<p style="color:#666;font-size:13px">Reference: <code>${escapeHtml(args.reference)}</code></p>` : ""}
       <p>Funds usually arrive within a few minutes to a few hours depending on your bank.</p>`,
    ),
  });
}

export async function sendRefundDecisionEmail(args: {
  to: string;
  approved: boolean;
  productTitle: string;
  amountKobo: number;
  note?: string | null;
}) {
  return sendEmail({
    to: args.to,
    subject: args.approved ? `Refund approved` : `Refund declined`,
    html: shell(
      args.approved ? `Your refund has been approved` : `Your refund request was declined`,
      `<p><strong>Item:</strong> ${escapeHtml(args.productTitle)}</p>
       <p><strong>Amount:</strong> ${fmtNaira(args.amountKobo)}</p>
       ${args.note ? `<p><strong>Note from support:</strong> ${escapeHtml(args.note)}</p>` : ""}
       ${
         args.approved
           ? `<p>The amount will be returned to your original payment method within 5–10 business days.</p>`
           : `<p>If you'd like to discuss this decision, reply to this email and our team will follow up.</p>`
       }`,
    ),
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
