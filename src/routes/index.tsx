import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ShieldCheck,
  Truck,
  CreditCard,
  Headphones,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { formatNaira } from "@/lib/currency";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "ecove — Nigeria's multi-vendor marketplace" },
      {
        name: "description",
        content:
          "Shop phones, fashion, groceries and more from trusted Nigerian vendors. Pay in Naira, delivered nationwide.",
      },
    ],
  }),
});

interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, icon")
        .is("parent_id", null)
        .order("position", { ascending: true });
      if (!active) return;
      if (error) {
        // eslint-disable-next-line no-console
        console.warn("[ecove] could not load categories:", error.message);
        return;
      }
      setCategories((data ?? []) as Category[]);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-accent/20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-2 md:py-20">
          <div className="flex flex-col justify-center">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              Nigeria&apos;s marketplace
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight tracking-tight md:text-6xl">
              Shop everything,
              <br />
              <span className="text-primary">delivered nationwide.</span>
            </h1>
            <p className="mt-4 max-w-lg text-base text-muted-foreground md:text-lg">
              Thousands of trusted vendors. One marketplace. Pay securely in Naira and
              get your orders delivered to your door.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/signup">
                  Start shopping <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/login">Become a vendor</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span>
                <strong className="text-foreground">10k+</strong> products
              </span>
              <span>
                <strong className="text-foreground">500+</strong> vendors
              </span>
              <span>
                <strong className="text-foreground">36</strong> states
              </span>
            </div>
          </div>

          <div className="relative hidden md:flex">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary to-primary-glow opacity-90" />
            <div className="relative m-auto grid w-full max-w-sm grid-cols-2 gap-3 p-6 text-primary-foreground">
              <FeatureBadge icon={<Truck className="h-5 w-5" />} title="Fast delivery" />
              <FeatureBadge icon={<CreditCard className="h-5 w-5" />} title="Pay in Naira" />
              <FeatureBadge icon={<ShieldCheck className="h-5 w-5" />} title="Buyer protection" />
              <FeatureBadge icon={<Headphones className="h-5 w-5" />} title="24/7 support" />
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto w-full max-w-7xl px-4 py-12">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-display text-2xl font-bold md:text-3xl">
            Shop by category
          </h2>
          <span className="text-sm text-muted-foreground">10 top categories</span>
        </div>

        {categories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">No categories yet.</p>
            <p className="mt-1">
              Run <code className="rounded bg-muted px-1.5 py-0.5">db/0001_init.sql</code> in
              your Supabase SQL editor to seed categories.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 text-center transition hover:border-primary hover:shadow-md"
              >
                <span className="text-3xl transition group-hover:scale-110">
                  {c.icon ?? "🛍️"}
                </span>
                <span className="text-sm font-medium">{c.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Featured promos */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-16">
        <div className="grid gap-4 md:grid-cols-3">
          <PromoCard
            badge="Free shipping"
            title="On orders above ₦50,000"
            subtitle={`Get free delivery nationwide above ${formatNaira(50000)}.`}
            tone="primary"
          />
          <PromoCard
            badge="New vendor?"
            title="0% commission for 30 days"
            subtitle="Open your store today and start earning."
            tone="dark"
          />
          <PromoCard
            badge="Buyer protection"
            title="Pay safely with Paystack"
            subtitle="Your money is safe until your order arrives."
            tone="accent"
          />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function FeatureBadge({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl bg-white/15 p-4 backdrop-blur-sm">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
        {icon}
      </span>
      <span className="text-sm font-semibold">{title}</span>
    </div>
  );
}

function PromoCard({
  badge,
  title,
  subtitle,
  tone,
}: {
  badge: string;
  title: string;
  subtitle: string;
  tone: "primary" | "dark" | "accent";
}) {
  const toneClasses = {
    primary: "bg-primary text-primary-foreground",
    dark: "bg-secondary text-secondary-foreground",
    accent: "bg-accent text-accent-foreground",
  }[tone];
  return (
    <div className={`rounded-2xl p-6 ${toneClasses}`}>
      <span className="inline-flex rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide">
        {badge}
      </span>
      <h3 className="mt-3 font-display text-xl font-bold leading-tight">{title}</h3>
      <p className="mt-1 text-sm opacity-90">{subtitle}</p>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-secondary text-secondary-foreground">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-display font-bold text-primary-foreground">
              e
            </span>
            <span className="font-display text-xl font-bold">ecove</span>
          </div>
          <p className="mt-3 text-sm opacity-75">
            Nigeria&apos;s multi-vendor marketplace.
          </p>
        </div>
        <FooterCol title="Shop" items={["Categories", "Deals", "New arrivals", "Brands"]} />
        <FooterCol title="Sell" items={["Open a store", "Vendor center", "Pricing", "Help"]} />
        <FooterCol title="Company" items={["About", "Contact", "Privacy", "Terms"]} />
      </div>
      <div className="border-t border-white/10 px-4 py-4 text-center text-xs opacity-60">
        © {new Date().getFullYear()} ecove. All rights reserved.
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="font-display text-sm font-bold uppercase tracking-wide">{title}</h4>
      <ul className="mt-3 space-y-2 text-sm opacity-75">
        {items.map((i) => (
          <li key={i}>
            <a href="#" className="hover:opacity-100 hover:underline">
              {i}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
