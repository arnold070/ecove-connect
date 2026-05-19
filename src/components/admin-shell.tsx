import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  ShieldCheck,
  Settings,
  Users,
  Truck,
  Stethoscope,
  Menu,
  LogOut,
  ChevronLeft,
  Bell,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";

interface AdminNavLink {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const NAV: { title: string; items: AdminNavLink[] }[] = [
  {
    title: "Moderation",
    items: [
      { to: "/admin/approvals", label: "Vendor approvals", icon: <Users className="h-4 w-4" /> },
      { to: "/admin/products", label: "Product moderation", icon: <ShieldCheck className="h-4 w-4" /> },
      { to: "/admin/orders", label: "Orders & payments", icon: <Truck className="h-4 w-4" /> },
    ],
  },
  {
    title: "Platform",
    items: [
      { to: "/admin/settings", label: "API Keys & Integrations", icon: <Settings className="h-4 w-4" /> },
      { to: "/admin/diagnostics", label: "Diagnostics", icon: <Stethoscope className="h-4 w-4" /> },
    ],
  },
];

interface AdminShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function AdminShell({ children, title, subtitle }: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, signOut } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const initial = (user?.email ?? "A")[0]!.toUpperCase();
  const displayName = user?.email?.split("@")[0] ?? "Admin";

  return (
    <div className="min-h-screen bg-muted/40">
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-sidebar-border px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-sidebar-foreground/40">
            ecove Admin
          </p>
          <Link to="/admin/settings" className="mt-1 flex items-center gap-2 font-display text-lg font-extrabold">
            Control Panel
            <span className="h-2 w-2 rounded-full bg-destructive" />
          </Link>
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
            ● Admin role
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map((section) => (
            <div key={section.title} className="mb-2">
              <p className="px-5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/30">
                {section.title}
              </p>
              {section.items.map((item) => {
                const active = path.startsWith(item.to);
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
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="mt-4 border-t border-sidebar-border pt-3">
            <Link
              to="/vendor"
              className="mx-2 flex items-center gap-2.5 rounded-md px-3 py-2 text-[12px] font-medium text-sidebar-foreground/60 hover:bg-primary/15 hover:text-sidebar-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to vendor area
            </Link>
          </div>
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive text-sm font-bold text-destructive-foreground">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className="truncate text-[11px] text-sidebar-foreground/50">Administrator</p>
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

      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
        />
      ) : null}

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
          <button
            type="button"
            aria-label="Notifications"
            className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border"
          >
            <Bell className="h-4 w-4" />
          </button>
        </header>

        <main className="px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
