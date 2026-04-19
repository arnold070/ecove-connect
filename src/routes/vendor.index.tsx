import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import {
  TrendingUp,
  ShoppingBag,
  Package,
  Star,
  AlertTriangle,
  ArrowUpRight,
  Plus,
  ClipboardList,
  Boxes,
  Store,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { VendorShell } from "@/components/vendor-shell";
import { formatNaira } from "@/lib/currency";

export const Route = createFileRoute("/vendor/")({
  component: VendorDashboardPage,
});

const SALES_BARS = [40, 65, 50, 80, 95, 70, 88]; // mocked weekly sales heights

const STATS = [
  {
    label: "Total Revenue",
    value: "₦4.2M",
    change: "↑ 18% this month",
    icon: <TrendingUp className="h-5 w-5" />,
    tone: "bg-primary/15 text-primary",
  },
  {
    label: "Orders",
    value: "324",
    change: "↑ 22 this week",
    icon: <ShoppingBag className="h-5 w-5" />,
    tone: "bg-blue-500/15 text-blue-600",
  },
  {
    label: "Live Products",
    value: "139",
    change: "↑ 5 approved",
    icon: <Package className="h-5 w-5" />,
    tone: "bg-success/15 text-success",
  },
  {
    label: "Avg Rating",
    value: "4.8",
    change: "↑ 0.2 this month",
    icon: <Star className="h-5 w-5" />,
    tone: "bg-purple-500/15 text-purple-600",
  },
];

const RECENT_ORDERS = [
  { id: "#ECV-30412", customer: "Adaeze N.", product: "Samsung Galaxy A55", total: 28500000, status: "Delivered" },
  { id: "#ECV-30411", customer: "Tunde A.", product: "HP Pavilion 15", total: 28500000, status: "Shipped" },
  { id: "#ECV-30410", customer: "Chika O.", product: "Logitech MX Master 3", total: 2800000, status: "Processing" },
  { id: "#ECV-30409", customer: "Bisi M.", product: "Tecno Spark 20 Pro+", total: 14500000, status: "Pending" },
  { id: "#ECV-30408", customer: "Femi K.", product: "Nike Air Max 270", total: 4500000, status: "Delivered" },
];

const STATUS_TONES: Record<string, string> = {
  Delivered: "bg-success/15 text-success",
  Shipped: "bg-blue-500/15 text-blue-600",
  Processing: "bg-purple-500/15 text-purple-600",
  Pending: "bg-warning/20 text-warning-foreground",
};

const PRODUCT_STATUS = [
  { label: "✅ Approved (Live)", value: 139, percent: 89, color: "bg-success" },
  { label: "⏳ Pending Review", value: 3, percent: 2, color: "bg-warning" },
  { label: "❌ Rejected", value: 2, percent: 1.3, color: "bg-destructive" },
  { label: "📦 Out of Stock", value: 4, percent: 2.5, color: "bg-muted-foreground" },
];

function VendorDashboardPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/login" });
  }, [loading, user, navigate]);

  const greeting = useMemo(() => {
    const name = user?.email?.split("@")[0] ?? "vendor";
    return `Welcome back, ${name}!`;
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 text-sm text-muted-foreground">
        Loading dashboard…
      </div>
    );
  }

  return (
    <VendorShell
      title="Vendor Dashboard"
      subtitle={greeting}
      primaryAction={{ label: "Add Product", to: "/vendor/products/new" }}
      secondaryAction={{ label: "Export" }}
    >
      {/* Notice */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/15 p-4 text-foreground">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning-foreground" />
        <p className="text-sm">
          <strong>3 products pending admin review.</strong> You will be notified once they are
          approved or rejected. Products are only visible to customers after admin approval.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${s.tone}`}>
              {s.icon}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="font-display text-xl font-bold text-foreground">{s.value}</p>
              <p className="text-[11px] font-semibold text-success">{s.change}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Sales chart + payout/quick */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card title="📈 Sales — Last 7 days" className="lg:col-span-2">
          <div className="flex h-48 items-end gap-2 sm:h-60">
            {SALES_BARS.map((h, i) => (
              <div
                key={i}
                className="group relative flex-1 rounded-t-md bg-gradient-to-t from-primary to-primary-glow transition hover:opacity-80"
                style={{ height: `${h}%` }}
                aria-label={`Day ${i + 1}: ${h}%`}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="💸 Pending Payout">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Available for withdrawal</p>
              <p className="mt-1 font-display text-3xl font-extrabold text-success">
                {formatNaira(58000000)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">After 8% commission</p>
              <Link
                to="/vendor/earnings"
                className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Request withdrawal <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </Card>
          <Card title="⚡ Quick Actions">
            <div className="grid grid-cols-2 gap-2">
              <QuickAction
                to="/vendor/products/new"
                tone="bg-primary/10 border-primary/30 text-primary"
                icon={<Plus className="h-3.5 w-3.5" />}
                label="Add Product"
              />
              <QuickAction
                to="/vendor/orders"
                tone="bg-blue-500/10 border-blue-500/30 text-blue-700"
                icon={<ClipboardList className="h-3.5 w-3.5" />}
                label="View Orders"
              />
              <QuickAction
                to="/vendor/inventory"
                tone="bg-success/10 border-success/30 text-success"
                icon={<Boxes className="h-3.5 w-3.5" />}
                label="Inventory"
              />
              <QuickAction
                to="/vendor/store"
                tone="bg-purple-500/10 border-purple-500/30 text-purple-700"
                icon={<Store className="h-3.5 w-3.5" />}
                label="My Store"
              />
            </div>
          </Card>
        </div>
      </div>

      {/* Recent orders + product status */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="📦 Recent orders"
          right={
            <Link to="/vendor/orders" className="text-xs font-semibold text-primary hover:underline">
              View all →
            </Link>
          }
          className="lg:col-span-2"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Order</th>
                  <th className="py-2 pr-3 font-semibold">Customer</th>
                  <th className="py-2 pr-3 font-semibold">Product</th>
                  <th className="py-2 pr-3 font-semibold">Total</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {RECENT_ORDERS.map((o) => (
                  <tr key={o.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-xs text-foreground">{o.id}</td>
                    <td className="py-2.5 pr-3 text-foreground">{o.customer}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{o.product}</td>
                    <td className="py-2.5 pr-3 font-semibold text-foreground">
                      {formatNaira(o.total)}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          STATUS_TONES[o.status] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="⏳ Product status">
          <div className="flex flex-col gap-4">
            {PRODUCT_STATUS.map((p) => (
              <div key={p.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">{p.label}</span>
                  <span className="font-bold text-foreground">{p.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${p.color}`}
                    style={{ width: `${p.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </VendorShell>
  );
}

function Card({
  title,
  right,
  children,
  className = "",
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col rounded-xl border border-border bg-card shadow-sm ${className}`}
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-display text-sm font-bold text-foreground">{title}</h2>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function QuickAction({
  to,
  tone,
  icon,
  label,
}: {
  to: string;
  tone: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 text-xs font-semibold transition hover:opacity-80 ${tone}`}
    >
      {icon}
      {label}
    </Link>
  );
}
