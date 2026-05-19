import { Link } from "@tanstack/react-router";
import {
  ShoppingBag,
  Search,
  User2,
  ClipboardList,
  HelpCircle,
  Menu,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";

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

export function SiteHeader() {
  const { user, signOut } = useAuth();

  return (
    <div className="sticky top-0 z-40 w-full">
      {/* Top bar */}
      <div className="bg-success-dark text-success-foreground text-xs">
        <div className="mx-auto flex h-8 max-w-7xl items-center justify-between gap-4 px-4">
          <div className="hidden items-center gap-5 sm:flex">
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
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-1 font-display text-2xl font-extrabold tracking-tight">
            <span className="text-foreground">eco</span>
            <span className="text-primary">ve</span>
            <span className="ml-0.5 mt-3 h-2 w-2 rounded-full bg-primary" />
          </Link>

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
            <Link to="/cart" className="flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground">
              <ShoppingBag className="h-5 w-5" />
              <span className="hidden sm:inline">Cart</span>
            </Link>
            {user ? (
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <User2 className="h-5 w-5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            ) : (
              <Link
                to="/login"
                className="flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <User2 className="h-5 w-5" />
                <span className="hidden sm:inline">Account</span>
              </Link>
            )}
            <HeaderIcon icon={<ClipboardList className="h-5 w-5" />} label="Orders" />
            <HeaderIcon icon={<HelpCircle className="h-5 w-5" />} label="Help" />
          </nav>
        </div>
      </header>

      {/* Mega menu nav */}
      <nav className="border-b border-border bg-foreground text-background">
        <div className="mx-auto flex h-11 max-w-7xl items-center gap-1 overflow-x-auto px-4 text-sm">
          <button
            type="button"
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground"
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
      className="relative flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      <span className="relative">
        {icon}
        {badge ? (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
