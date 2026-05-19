import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { absoluteUrl } from "@/lib/site-url";

export const Route = createFileRoute("/refund-policy")({
  component: RefundPolicyPage,
  head: () => ({
    meta: [
      { title: "Refund Policy — ecove" },
      { name: "description", content: "When and how you can request a refund on ecove orders." },
      { property: "og:title", content: "Refund Policy — ecove" },
      { property: "og:description", content: "When and how refunds are issued on ecove." },
      { property: "og:url", content: absoluteUrl("/refund-policy") },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/refund-policy") }],
  }),
});

function RefundPolicyPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-3xl font-extrabold">Refund Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: May 2026</p>

        <Section title="When you can request a refund">
          You may open a refund request within <strong>7 days</strong> of marking the item delivered if
          the item is materially different from its listing, defective, or never arrived.
        </Section>
        <Section title="How to request">
          Go to <em>My orders</em>, open the order, choose the item, and tap <em>Request refund</em>.
          You'll be asked for a reason and may attach evidence (photos).
        </Section>
        <Section title="Review timeline">
          Admin review usually completes within <strong>3 business days</strong>. You can cancel your
          request at any time before a decision is made.
        </Section>
        <Section title="Approved refunds">
          Approved refunds are returned to the original payment method via Paystack. Bank credits typically
          arrive within <strong>5–10 business days</strong> depending on your bank.
        </Section>
        <Section title="Rejected requests">
          If your request is rejected you will receive an email explaining why. You can contact support
          to escalate.
        </Section>
        <Section title="Vendor-initiated cancellations">
          If a vendor cancels an order before fulfilment, you are refunded in full automatically.
        </Section>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground/80">{children}</p>
    </section>
  );
}
