import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ShoppingBag,
  Search,
  User2,
  ClipboardList,
  HelpCircle,
  Menu,
  Home,
  Grid3x3,
  X,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { getPublicBranding } from "@/lib/branding.functions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const NAV_ITEMS = [
  { label: "Phones", icon: "📱" },
  { label: "Computers", icon: "💻" },
  { label: "Electronics", icon: "📺" },
  { label: "Fashion", icon: "👗" },
  { label: "Home", icon: "🏠" },
  { label: "Beauty", icon: "💄" },
  { label: "Sports", icon: "⚽" },
  { label: "Groceries", icon: "🛒" },
];

function useLogoUrl(): string | null {
  const fetchBranding = useServerFn(getPublicBranding);
  const { data } = useQuery({
    queryKey: ["public-branding"],
    queryFn: () => fetchBranding(),
    staleTime: 5 * 60 * 1000,
  });
  return data?.logoUrl ?? null;
}

function BrandLogo({ logoUrl }: { logoUrl: string | null }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt="ecove"
        className="h-8 w-auto max-w-[140px] object-contain md:h-10"
      />
    );
  }
  return (
    <span className="flex items-center gap-1 font-display text-xl font-extrabold tracking-tight md:text-2xl">
      <span className="text-foreground">eco</span>
      <span className="text-primary">ve</span>
      <span className="ml-0.5 mt-2 h-1.5 w-1.5 rounded-full bg-primary md:mt-3 md:h-2 md:w-2" />
    </span>
  );
}

export function SiteHeader() {
  const { user, signOut } = useAuth();
  const logoUrl = useLogoUrl();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="sticky top-0 z-40 w-full">
      {/* Top bar — hidden on small mobile */}
      <div className="hidden bg-success-dark text-xs text-success-foreground sm:block">
        <div className="mx-auto flex h-8 max-w-7xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-5">
            <a href="#" className="hover:underline">
              Sell on ecove{" "}
              <span className="ml-1 rounded bg-background px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
                New
              </span>
            </a>
            <a href="#" className="hover:underline">Download app</a>
            <a href="#" className="hover:underline">Track my order</a>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <span>🇳🇬 Nigeria (NGN ₦)</span>
            <a href="#" className="hover:underline">Help</a>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 md:h-16 md:gap-4 md:px-4">
          {/* Mobile menu trigger */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className="rounded-md p-2 text-foreground hover:bg-muted md:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b border-border bg-primary px-4 py-4 text-primary-foreground">
                <SheetTitle className="text-left text-primary-foreground">
                  {user ? `Hi, ${user.email?.split("@")[0]}` : "Welcome"}
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col py-2">
                {!user && (
                  <Link
                    to="/login"
                    onClick={() => setMenuOpen(false)}
                    className="border-b border-border px-4 py-3 text-sm font-semibold text-primary"
                  >
                    Sign in / Register
                  </Link>
                )}
                <p className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Categories
                </p>
                {NAV_ITEMS.map((n) => (
                  <button
                    key={n.label}
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 border-b border-border px-4 py-3 text-left text-sm text-foreground hover:bg-muted"
                  >
                    <span className="text-lg">{n.icon}</span>
                    {n.label}
                  </button>
                ))}
                <p className="mt-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  My account
                </p>
                <Link
                  to="/account/orders"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 border-b border-border px-4 py-3 text-sm text-foreground hover:bg-muted"
                >
                  <ClipboardList className="h-4 w-4" /> My orders
                </Link>
                <Link
                  to="/cart"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 border-b border-border px-4 py-3 text-sm text-foreground hover:bg-muted"
                >
                  <ShoppingBag className="h-4 w-4" /> My cart
                </Link>
                <a
                  href="#"
                  className="flex items-center gap-3 border-b border-border px-4 py-3 text-sm text-foreground hover:bg-muted"
                >
                  <HelpCircle className="h-4 w-4" /> Help center
                </a>
                {user && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void signOut();
                    }}
                    className="mt-2 flex items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-destructive hover:bg-muted"
                  >
                    <X className="h-4 w-4" /> Sign out
                  </button>
                )}
              </nav>
            </SheetContent>
          </Sheet>

          <Link to="/" className="flex shrink-0 items-center">
            <BrandLogo logoUrl={logoUrl} />
          </Link>

          {/* Desktop search */}
          <div className="hidden flex-1 md:block">
            <form className="flex h-11 items-stretch overflow-hidden rounded-lg border-2 border-primary bg-background">
              <select
                className="hidden h-full border-r border-border bg-muted px-3 text-sm outline-none lg:block"
                aria-label="Search category"
              >
                <option>All Categories</option>
                <option>Phones & Tablets</option>
                <option>Electronics</option>
                <option>Fashion</option>
                <option>Home & Kitchen</option>
              </select>
              <input
                type="search"
                placeholder="Search products, brands, categories…"
                className="h-full flex-1 bg-background px-4 text-sm outline-none"
              />
              <button
                type="submit"
                aria-label="Search"
                className="flex w-12 items-center justify-center bg-primary text-primary-foreground transition hover:opacity-90"
              >
                <Search className="h-5 w-5" />
              </button>
            </form>
          </div>

          <nav className="ml-auto flex items-center gap-1">
            <Link
              to="/cart"
              className="relative flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground md:px-3"
            >
              <ShoppingBag className="h-5 w-5" />
              <span className="hidden sm:inline">Cart</span>
            </Link>
            {user ? (
              <button
                type="button"
                onClick={() => void signOut()}
                className="hidden flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground sm:flex"
              >
                <User2 className="h-5 w-5" />
                <span>Sign out</span>
              </button>
            ) : (
              <Link
                to="/login"
                className="hidden flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground sm:flex"
              >
                <User2 className="h-5 w-5" />
                <span>Account</span>
              </Link>
            )}
            <Link
              to="/account/orders"
              className="hidden flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground sm:flex"
            >
              <ClipboardList className="h-5 w-5" />
              <span>Orders</span>
            </Link>
            <HeaderIcon icon={<HelpCircle className="h-5 w-5" />} label="Help" />
          </nav>
        </div>

        {/* Mobile search row — always visible below header on small screens */}
        <div className="border-t border-border bg-background px-3 py-2 md:hidden">
          <form className="flex h-10 items-stretch overflow-hidden rounded-full border border-primary bg-background">
            <input
              type="search"
              placeholder="Search products, brands…"
              className="h-full flex-1 bg-background px-4 text-sm outline-none"
            />
            <button
              type="submit"
              aria-label="Search"
              className="flex w-11 items-center justify-center bg-primary text-primary-foreground"
            >
              <Search className="h-4 w-4" />
            </button>
          </form>
        </div>
      </header>

      {/* Mega menu nav — scrollable on mobile */}
      <nav className="border-b border-border bg-foreground text-background">
        <div className="mx-auto flex h-11 max-w-7xl items-center gap-1 overflow-x-auto px-3 text-sm md:px-4">
          <button
            type="button"
            className="hidden shrink-0 items-center gap-2 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground md:flex"
          >
            <Menu className="h-4 w-4" /> All Categories
          </button>
          {NAV_ITEMS.map((n) => (
            <button
              key={n.label}
              type="button"
              className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-background/80 transition hover:bg-background/10 hover:text-background"
            >
              <span>{n.icon}</span>
              {n.label}
            </button>
          ))}
          <button
            type="button"
            className="ml-auto hidden shrink-0 rounded-md bg-destructive px-3 py-1.5 font-semibold text-destructive-foreground md:block"
          >
            ⚡ Flash Sales
          </button>
        </div>
      </nav>
    </div>
  );
}

function HeaderIcon({
  icon,
  label,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      className="relative hidden flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground sm:flex"
    >
      <span className="relative">
        {icon}
        {badge ? (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </span>
      <span>{label}</span>
    </button>
  );
}

/**
 * Sticky Jumia-style bottom navigation for mobile screens.
 * Render at the root of any page where mobile nav makes sense.
 */
export function MobileBottomNav() {
  const { user } = useAuth();
  const items = [
    { to: "/" as const, label: "Home", icon: <Home className="h-5 w-5" /> },
    { to: "/" as const, label: "Categories", icon: <Grid3x3 className="h-5 w-5" /> },
    { to: "/cart" as const, label: "Cart", icon: <ShoppingBag className="h-5 w-5" /> },
    {
      to: user ? ("/account/orders" as const) : ("/login" as const),
      label: user ? "Account" : "Sign in",
      icon: <User2 className="h-5 w-5" />,
    },
  ];
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-7xl items-stretch justify-around">
        {items.map((it) => (
          <li key={it.label} className="flex-1">
            <Link
              to={it.to}
              className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground transition hover:text-primary"
              activeProps={{ className: "text-primary" }}
              activeOptions={{ exact: it.to === "/" }}
            >
              {it.icon}
              <span>{it.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
