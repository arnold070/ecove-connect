import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms of Service — ecove" },
      { name: "description", content: "The terms that govern your use of ecove, Nigeria's multi-vendor marketplace." },
      { property: "og:title", content: "Terms of Service — ecove" },
      { property: "og:description", content: "The terms that govern your use of ecove." },
      { property: "og:url", content: "https://ecove-connect.lovable.app/terms" },
    ],
    links: [{ rel: "canonical", href: "https://ecove-connect.lovable.app/terms" }],
  }),
});

function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-3xl font-extrabold">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: May 2026</p>

        <Section title="1. Who we are">
          ecove is an online marketplace operated in Nigeria that connects independent vendors with buyers.
          ecove is not the seller of items listed by vendors; we provide the platform, payment processing
          (via Paystack), and dispute resolution.
        </Section>

        <Section title="2. Accounts">
          You must provide accurate information when creating an account, keep your credentials secure, and
          are responsible for activity on your account. You must be at least 18 years old to transact.
        </Section>

        <Section title="3. Vendor obligations">
          Vendors warrant they have the right to sell listed items, that listings are accurate, that goods
          ship within the stated handling time, and that they comply with Nigerian consumer-protection and
          tax law.
        </Section>

        <Section title="4. Buyer obligations">
          Buyers agree to pay the listed price plus any shipping at checkout and to provide accurate delivery
          information. Chargebacks made in bad faith may result in account suspension.
        </Section>

        <Section title="5. Payments and payouts">
          Payments are processed by Paystack. Funds for completed orders are credited to vendor ledgers and
          paid out on request, less the platform commission disclosed at sign-up.
        </Section>

        <Section title="6. Prohibited items">
          Firearms, controlled drugs, counterfeit goods, live animals, and any item illegal under Nigerian
          law are prohibited. ecove may remove listings and suspend accounts at its discretion.
        </Section>

        <Section title="7. Limitation of liability">
          ecove provides the platform "as is". To the maximum extent permitted by law, our liability for any
          single transaction is limited to the order value.
        </Section>

        <Section title="8. Contact">
          Questions about these terms: <a className="text-primary underline" href="mailto:legal@ecove.ng">legal@ecove.ng</a>.
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
