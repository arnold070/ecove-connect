import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Truck,
  RefreshCw,
  ShieldCheck,
  Headphones,
  ChevronRight,
  ChevronLeft,
  Flame,
  Sparkles,
  Tag,
  Mail,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { ProductCard } from "@/components/product-card";
import { sampleProducts, storefrontCategories } from "@/lib/sample-products";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "ecove — Nigeria's online marketplace | Shop smart, live better" },
      {
        name: "description",
        content:
          "Shop electronics, fashion, home appliances, phones, beauty products and more at the best prices in Nigeria. Fast delivery nationwide.",
      },
    ],
  }),
});

const HERO_SLIDES = [
  {
    badge: "🔥 Hot Deal",
    title: "Smartphones\nUp to 40% Off",
    subtitle: "Premium brands at unbeatable prices.\nLimited stock available!",
    cta: "Shop now",
    emoji: "📱",
    bg: "from-primary to-primary-glow",
  },
  {
    badge: "✨ New Arrivals",
    title: "Fashion Week\nMega Sale",
    subtitle: "Discover the latest trends in\nNigerian & African fashion.",
    cta: "Explore",
    emoji: "👗",
    bg: "from-pink-500 to-rose-400",
  },
  {
    badge: "⚡ Flash Sale",
    title: "Electronics\nClearance Sale",
    subtitle: "TVs, laptops, appliances & more.\nSave big today!",
    cta: "Grab deals",
    emoji: "📺",
    bg: "from-indigo-600 to-blue-500",
  },
];

function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <SiteHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <TrustStrip />
        <HeroSection />
        <CategoryGrid />
        <FlashSaleSection />
        <PromoStrip />
        <FeaturedSection />
        <FullPromoBanner />
        <BestSellersCarousel />
        <DualBanners />
        <NewArrivalsCarousel />
        <Newsletter />
      </main>

      <SiteFooter />
    </div>
  );
}

/* ─────────── Sections ─────────── */

function TrustStrip() {
  const items = [
    { icon: <Truck className="h-6 w-6" />, title: "Free delivery", sub: "On orders above ₦15,000" },
    { icon: <RefreshCw className="h-6 w-6" />, title: "Easy returns", sub: "15-day hassle-free returns" },
    { icon: <ShieldCheck className="h-6 w-6" />, title: "Secure payment", sub: "100% protected transactions" },
    { icon: <Headphones className="h-6 w-6" />, title: "24/7 support", sub: "Always here to help you" },
  ];
  return (
    <div className="mb-6 grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
      {items.map((i) => (
        <div key={i.title} className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {i.icon}
          </span>
          <div>
            <h5 className="text-sm font-bold text-foreground">{i.title}</h5>
            <p className="text-xs text-muted-foreground">{i.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function HeroSection() {
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % HERO_SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);
  const current = HERO_SLIDES[slide];

  return (
    <section className="mb-6 grid gap-4 lg:grid-cols-[220px_1fr_260px]">
      {/* Sidebar categories */}
      <aside className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:block">
        <div className="border-b border-border bg-muted px-4 py-2.5 text-sm font-bold text-foreground">
          📋 Categories
        </div>
        <ul>
          {storefrontCategories.map((c) => (
            <li key={c.slug} className="border-b border-border last:border-0">
              <div className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-foreground">
                <span className="text-base">{c.icon}</span>
                {c.name}
              </div>
              <ul className="pb-2">
                {c.subcategories.map((s) => (
                  <li key={s.slug}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-6 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                    >
                      <span>{s.icon}</span>
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </aside>

      {/* Slider */}
      <div className={`relative flex min-h-[280px] overflow-hidden rounded-xl bg-gradient-to-br ${current.bg} text-primary-foreground shadow-md transition-all duration-700`}>
        <div className="relative z-10 flex flex-1 flex-col justify-center gap-3 p-6 md:p-10">
          <span className="w-fit rounded-full bg-background/20 px-3 py-1 text-xs font-semibold backdrop-blur">
            {current.badge}
          </span>
          <h2 className="whitespace-pre-line font-display text-3xl font-extrabold leading-tight md:text-5xl">
            {current.title}
          </h2>
          <p className="whitespace-pre-line text-sm opacity-95 md:text-base">
            {current.subtitle}
          </p>
          <Link
            to="/signup"
            className="mt-2 inline-flex w-fit items-center gap-2 rounded-md bg-background px-5 py-2.5 text-sm font-bold text-primary shadow-md transition hover:scale-105"
          >
            {current.cta} <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="hidden items-center justify-center text-[10rem] opacity-90 md:flex md:w-1/3">
          {current.emoji}
        </div>
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
          {HERO_SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() => setSlide(i)}
              className={`h-2 rounded-full transition-all ${i === slide ? "w-6 bg-background" : "w-2 bg-background/50"}`}
            />
          ))}
        </div>
      </div>

      {/* Promo cards */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        <PromoMiniCard
          icon={<Tag className="h-5 w-5" />}
          title="Best Deals"
          sub="Huge discounts every day"
          tone="bg-gradient-to-br from-rose-500 to-red-500"
        />
        <PromoMiniCard
          icon={<Sparkles className="h-5 w-5" />}
          title="New Arrivals"
          sub="Fresh drops this week"
          tone="bg-gradient-to-br from-emerald-500 to-teal-500"
        />
        <PromoMiniCard
          icon={<Flame className="h-5 w-5" />}
          title="Flash Sales"
          sub="Limited time offers"
          tone="bg-gradient-to-br from-orange-500 to-amber-500"
        />
      </div>
    </section>
  );
}

function PromoMiniCard({
  icon,
  title,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  tone: string;
}) {
  return (
    <button
      type="button"
      className={`group flex items-center gap-3 rounded-xl p-4 text-left text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${tone}`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/20 backdrop-blur">
        {icon}
      </span>
      <div className="flex-1">
        <h4 className="font-display text-base font-bold">{title}</h4>
        <p className="text-xs opacity-90">{sub}</p>
      </div>
      <ChevronRight className="h-5 w-5 transition group-hover:translate-x-1" />
    </button>
  );
}

function SectionTitle({ title, href = "#" }: { title: string; href?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h3 className="flex items-center gap-2 font-display text-lg font-bold text-foreground md:text-xl">
        <span className="h-5 w-1 rounded-full bg-primary" />
        {title}
      </h3>
      <a href={href} className="text-sm font-semibold text-primary hover:underline">
        View all →
      </a>
    </div>
  );
}

function CategoryGrid() {
  return (
    <section className="mb-6">
      <SectionTitle title="Shop by category" />
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-sm md:grid-cols-3">
        {storefrontCategories.map((c) => (
          <div
            key={c.slug}
            className="rounded-lg border border-border bg-background p-4 transition hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${c.tone} text-2xl`}
              >
                {c.icon}
              </span>
              <div>
                <h4 className="font-display text-base font-bold text-foreground">{c.name}</h4>
                <p className="text-xs text-muted-foreground">{c.subcategories.length} subcategories</p>
              </div>
            </div>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {c.subcategories.map((s) => (
                <li key={s.slug}>
                  <button
                    type="button"
                    className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:border-primary hover:bg-primary/10 hover:text-primary"
                  >
                    {s.icon} {s.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function FlashSaleSection() {
  const target = useRef(Date.now() + 5 * 3600 * 1000 + 42 * 60 * 1000);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, target.current - now);
  const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
  const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");

  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-1.5 font-display text-sm font-bold text-destructive-foreground">
          <Flame className="h-4 w-4 animate-pulse" /> Flash Sale
        </div>
        <span className="text-xs text-muted-foreground">Ends in:</span>
        <div className="flex items-center gap-1 font-mono text-sm font-bold">
          <span className="rounded bg-foreground px-2 py-1 text-background">{h}</span>:
          <span className="rounded bg-foreground px-2 py-1 text-background">{m}</span>:
          <span className="rounded bg-foreground px-2 py-1 text-background">{s}</span>
        </div>
        <a href="#" className="ml-auto text-sm font-semibold text-primary hover:underline">
          See all →
        </a>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {sampleProducts.slice(0, 8).map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

function PromoStrip() {
  const items = [
    { icon: "📱", title: "Phones under ₦50k", sub: "Budget-friendly picks" },
    { icon: "💎", title: "Premium brands", sub: "Samsung, Apple, LG & more" },
    { icon: "🚚", title: "Same-day delivery", sub: "Available in Lagos & Abuja" },
    { icon: "💳", title: "Pay on delivery", sub: "Cash or card at your door" },
  ];
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((i) => (
        <div
          key={i.title}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary"
        >
          <span className="text-3xl">{i.icon}</span>
          <div>
            <h5 className="text-sm font-bold text-foreground">{i.title}</h5>
            <p className="text-xs text-muted-foreground">{i.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function FeaturedSection() {
  return (
    <section className="mb-6">
      <SectionTitle title="Featured products" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {sampleProducts.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

function FullPromoBanner() {
  return (
    <section className="mb-6 overflow-hidden rounded-xl bg-gradient-to-r from-success-dark via-success to-success-dark text-success-foreground shadow-md">
      <div className="flex flex-col items-center gap-4 p-6 md:flex-row md:p-10">
        <div className="flex-1">
          <h2 className="font-display text-2xl font-extrabold md:text-4xl">
            Shop Nigerian brands
            <br />& support local 🇳🇬
          </h2>
          <p className="mt-2 text-sm opacity-95 md:text-base">
            Discover quality products made in Nigeria.
            <br />
            Support local entrepreneurs and businesses.
          </p>
          <a
            href="#"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-background px-5 py-2.5 text-sm font-bold text-success-dark shadow transition hover:scale-105"
          >
            Explore Made in Nigeria <ChevronRight className="h-4 w-4" />
          </a>
        </div>
        <span className="text-7xl md:text-9xl">🛍️</span>
      </div>
    </section>
  );
}

function CarouselSection({
  title,
  items,
}: {
  title: string;
  items: typeof sampleProducts;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    trackRef.current?.scrollBy({ left: dir * 600, behavior: "smooth" });
  };
  return (
    <section className="mb-6">
      <SectionTitle title={title} />
      <div className="relative">
        <button
          type="button"
          onClick={() => scroll(-1)}
          aria-label="Scroll left"
          className="absolute left-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 -translate-x-3 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md transition hover:bg-primary hover:text-primary-foreground md:flex"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div
          ref={trackRef}
          className="scrollbar-none flex gap-3 overflow-x-auto scroll-smooth pb-2"
          style={{ scrollbarWidth: "none" }}
        >
          {items.map((p) => (
            <div key={p.id} className="w-[160px] shrink-0 sm:w-[200px]">
              <ProductCard product={p} />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => scroll(1)}
          aria-label="Scroll right"
          className="absolute right-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 translate-x-3 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md transition hover:bg-primary hover:text-primary-foreground md:flex"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}

// Stable order so SSR and client render matches (no Math.random during render).
const bestSellers = [...sampleProducts].sort((a, b) => b.reviews - a.reviews);

function BestSellersCarousel() {
  return <CarouselSection title="Best sellers" items={bestSellers} />;
}

function DualBanners() {
  return (
    <div className="mb-6 grid gap-3 md:grid-cols-2">
      <div className="rounded-xl bg-gradient-to-br from-destructive to-rose-500 p-6 text-destructive-foreground shadow-sm">
        <h3 className="font-display text-xl font-bold">Clearance sale 🔥</h3>
        <p className="mt-1 text-sm opacity-95">
          Up to 60% off on selected items.
          <br />
          Limited quantities available!
        </p>
        <a
          href="#"
          className="mt-3 inline-flex items-center gap-1 rounded-md bg-background px-4 py-2 text-sm font-bold text-destructive"
        >
          Shop clearance →
        </a>
      </div>
      <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 p-6 text-primary-foreground shadow-sm">
        <h3 className="font-display text-xl font-bold">New arrivals ✨</h3>
        <p className="mt-1 text-sm opacity-95">
          Fresh products added daily.
          <br />
          Be the first to grab them!
        </p>
        <a
          href="#"
          className="mt-3 inline-flex items-center gap-1 rounded-md bg-background px-4 py-2 text-sm font-bold text-indigo-600"
        >
          Explore new →
        </a>
      </div>
    </div>
  );
}

function NewArrivalsCarousel() {
  return <CarouselSection title="New arrivals" items={[...sampleProducts].reverse()} />;
}

function Newsletter() {
  return (
    <section className="mb-6 grid gap-4 rounded-xl bg-foreground p-6 text-background shadow-md md:grid-cols-2 md:items-center md:p-8">
      <div className="flex items-start gap-3">
        <Mail className="h-8 w-8 text-primary" />
        <div>
          <h3 className="font-display text-xl font-bold">Get exclusive deals in your inbox</h3>
          <p className="mt-1 text-sm opacity-80">
            Subscribe for special offers, flash sales & new arrivals.
          </p>
        </div>
      </div>
      <form className="flex gap-2">
        <input
          type="email"
          required
          placeholder="Enter your email address"
          className="h-11 flex-1 rounded-md bg-background px-4 text-sm text-foreground outline-none ring-primary focus:ring-2"
        />
        <button
          type="submit"
          className="h-11 rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:opacity-90"
        >
          Subscribe
        </button>
      </form>
    </section>
  );
}

/* ─────────── Footer ─────────── */

function SiteFooter() {
  return (
    <footer className="mt-auto bg-foreground text-background">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-5">
        <div className="md:col-span-2">
          <Link to="/" className="flex items-center gap-1 font-display text-2xl font-extrabold">
            <span>eco</span>
            <span className="text-primary">ve</span>
            <span className="ml-0.5 mt-3 h-2 w-2 rounded-full bg-primary" />
          </Link>
          <p className="mt-3 max-w-sm text-sm opacity-75">
            Nigeria&apos;s trusted online marketplace. Shop electronics, fashion, home goods,
            beauty products and more. Fast delivery, secure payments, and excellent customer
            service.
          </p>
          <div className="mt-4 flex gap-2">
            {["f", "𝕏", "in", "📷", "▶"].map((s) => (
              <a
                key={s}
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-background/10 text-sm transition hover:bg-primary"
              >
                {s}
              </a>
            ))}
          </div>
        </div>
        <FooterCol
          title="Customer service"
          items={["Help center", "Track my order", "Returns & refunds", "Delivery info", "Contact us"]}
        />
        <FooterCol
          title="Sell on ecove"
          items={["Become a seller", "Seller center", "Seller policies", "Seller FAQs", "Advertise"]}
        />
        <FooterCol
          title="Company"
          items={["About ecove", "Careers", "Press & media", "Privacy policy", "Terms of service"]}
        />
      </div>
      <div className="border-t border-background/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 text-xs opacity-75 md:flex-row">
          <span>© {new Date().getFullYear()} ecove Nigeria Ltd. All rights reserved.</span>
          <div className="flex gap-2">
            {["Paystack", "Flutterwave", "VISA", "Mastercard", "Bank Transfer"].map((p) => (
              <span
                key={p}
                className="rounded border border-background/20 bg-background/5 px-2 py-1"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
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
            <a href="#" className="hover:text-primary hover:opacity-100">
              {i}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
