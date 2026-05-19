import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy — ecove" },
      { name: "description", content: "How ecove collects, uses, and protects your personal information." },
      { property: "og:title", content: "Privacy Policy — ecove" },
      { property: "og:description", content: "How ecove handles your data." },
      { property: "og:url", content: "https://ecove-connect.lovable.app/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://ecove-connect.lovable.app/privacy" }],
  }),
});

function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-3xl font-extrabold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: May 2026</p>

        <Section title="What we collect">
          Account details (name, email, phone), shipping address, order history, and — for vendors — KYC
          documents and bank-account details required for payouts. We do not store full card numbers; card
          data is handled by Paystack.
        </Section>
        <Section title="Why we collect it">
          To fulfil orders, process payments, verify vendor identity in line with NDPA / CBN guidance, and
          to send transactional emails (order receipts, payout notifications, refund decisions).
        </Section>
        <Section title="Who we share with">
          Paystack (payments), Resend (email delivery), Cloudinary (product image hosting), and our cloud
          hosting providers. We do not sell personal data.
        </Section>
        <Section title="Your rights">
          Under the Nigeria Data Protection Act you may request a copy of your data, correct inaccuracies,
          or request deletion (subject to legal retention requirements). Email
          {" "}<a className="text-primary underline" href="mailto:privacy@ecove.ng">privacy@ecove.ng</a>.
        </Section>
        <Section title="Retention">
          Order records are retained for at least 6 years for tax purposes. KYC documents are retained for
          the life of the vendor account plus 5 years.
        </Section>
        <Section title="Cookies">
          We use only the cookies required to keep you signed in and to remember your cart. We do not run
          third-party advertising trackers on the storefront.
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
