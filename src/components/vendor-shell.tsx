import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Wallet,
  Store,
  PlusCircle,
  Package,
  Clock,
  Boxes,
  Truck,
  RefreshCcw,
  TrendingUp,
  Star,
  UserCog,
  ScrollText,
  Bell,
  Download,
  Menu,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useAuth, type AppRole } from "@/auth/AuthProvider";

export interface VendorNavLink {
  to: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  requireRole?: AppRole;
}

const NAV_SECTIONS: { title: string; items: VendorNavLink[] }[] = [
  {
    title: "Overview",
    items: [
      { to: "/vendor", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
      { to: "/vendor/onboarding", label: "Onboarding & KYC", icon: <ShieldCheck className="h-4 w-4" /> },
      { to: "/vendor/earnings", label: "Earnings & Payouts", icon: <Wallet className="h-4 w-4" /> },
      { to: "/vendor/store", label: "My Store Page", icon: <Store className="h-4 w-4" /> },
    ],
  },
  {
    title: "Admin",
    items: [
      {
        to: "/vendor/admin/approvals",
        label: "Vendor approvals",
        icon: <Users className="h-4 w-4" />,
        requireRole: "admin",
      },
    ],
  },
  {
    title: "Products",
    items: [
      { to: "/vendor/products/new", label: "Add New Product", icon: <PlusCircle className="h-4 w-4" /> },
      { to: "/vendor/products", label: "My Products", icon: <Package className="h-4 w-4" /> },
      { to: "/vendor/products/pending", label: "Pending Approval", icon: <Clock className="h-4 w-4" />, badge: 3 },
      { to: "/vendor/inventory", label: "Inventory", icon: <Boxes className="h-4 w-4" /> },
    ],
  },
  {
    title: "Orders",
    items: [
      { to: "/vendor/orders", label: "My Orders", icon: <Truck className="h-4 w-4" />, badge: 5 },
      { to: "/vendor/returns", label: "Returns", icon: <RefreshCcw className="h-4 w-4" /> },
    ],
  },
  {
    title: "Reports",
    items: [
      { to: "/vendor/reports", label: "Sales Reports", icon: <TrendingUp className="h-4 w-4" /> },
      { to: "/vendor/reviews", label: "My Reviews", icon: <Star className="h-4 w-4" /> },
    ],
  },
  {
    title: "Account",
    items: [
      { to: "/vendor/profile", label: "Profile & Bank", icon: <UserCog className="h-4 w-4" /> },
      { to: "/vendor/policies", label: "Marketplace Policies", icon: <ScrollText className="h-4 w-4" /> },
      { to: "/vendor/settings", label: "API Keys & Settings", icon: <Settings className="h-4 w-4" /> },
    ],
  },
];

interface VendorShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  primaryAction?: { label: string; to: string };
  secondaryAction?: { label: string; onClick?: () => void };
}

export function VendorShell({
  children,
  title,
  subtitle,
  primaryAction,
  secondaryAction,
}: VendorShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, signOut, hasRole } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const initial = (user?.email ?? "V")[0]!.toUpperCase();
  const displayName = user?.email?.split("@")[0] ?? "Vendor";

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-sidebar-border px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-sidebar-foreground/40">
            ecove Marketplace
          </p>
          <Link to="/vendor" className="mt-1 flex items-center gap-2 font-display text-lg font-extrabold">
            {displayName}
            <span className="h-2 w-2 rounded-full bg-primary" />
          </Link>
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-semibold text-success">
            ● Active vendor
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter(
              (i) => !i.requireRole || hasRole(i.requireRole),
            );
            if (visibleItems.length === 0) return null;
            return (
            <div key={section.title} className="mb-2">
              <p className="px-5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/30">
                {section.title}
              </p>
              {visibleItems.map((item) => {
                const active =
                  item.to === "/vendor" ? path === "/vendor" : path.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={`mx-2 flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-sidebar-foreground/65 hover:bg-primary/15 hover:text-sidebar-foreground"
                    }`}
                  >
                    {item.icon}
                    <span className="flex-1">{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className="truncate text-[11px] text-sidebar-foreground/50">
                ID: V001 · ★ 4.8
              </p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Sign out"
              className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
        />
      ) : null}

      {/* Main */}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background px-4 md:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-base font-bold text-foreground md:text-lg">
              {title}
            </h1>
            {subtitle ? (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {secondaryAction ? (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="hidden items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted sm:inline-flex"
            >
              <Download className="h-3.5 w-3.5" />
              {secondaryAction.label}
            </button>
          ) : null}
          {primaryAction ? (
            <Link
              to={primaryAction.to}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              {primaryAction.label}
            </Link>
          ) : null}
          <button
            type="button"
            aria-label="Notifications"
            className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />
          </button>
        </header>

        <main className="px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
