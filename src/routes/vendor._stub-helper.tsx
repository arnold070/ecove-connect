import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { VendorShell } from "@/components/vendor-shell";

const STUBS: Record<string, { title: string; subtitle: string }> = {
  earnings: { title: "Earnings & Payouts", subtitle: "Track your revenue and request withdrawals" },
  store: { title: "My Store Page", subtitle: "Customize your public storefront" },
  "products-new": { title: "Add New Product", subtitle: "List a product for admin review" },
  products: { title: "My Products", subtitle: "Manage your active catalog" },
  "products-pending": { title: "Pending Approval", subtitle: "Products awaiting admin review" },
  inventory: { title: "Inventory", subtitle: "Stock levels and bulk updates" },
  orders: { title: "My Orders", subtitle: "Customer orders and fulfilment" },
  returns: { title: "Returns", subtitle: "Return requests and refunds" },
  reports: { title: "Sales Reports", subtitle: "Performance over time" },
  reviews: { title: "My Reviews", subtitle: "Customer ratings and feedback" },
  profile: { title: "Profile & Bank", subtitle: "Account info and payout details" },
  policies: { title: "Marketplace Policies", subtitle: "Rules vendors must follow" },
};

export function VendorStubPage({ stubKey }: { stubKey: keyof typeof STUBS }) {
  const meta = STUBS[stubKey];
  return (
    <VendorShell title={meta.title} subtitle={meta.subtitle}>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Construction className="h-7 w-7" />
        </span>
        <h3 className="mt-4 font-display text-lg font-bold text-foreground">Coming soon</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          This section is part of the vendor dashboard scaffolding. We&apos;ll wire it to live
          data from Lovable Cloud next.
        </p>
      </div>
    </VendorShell>
  );
}

// Default export to satisfy bundler; this file is only imported by stub routes.
export const Route = createFileRoute("/vendor/_stub-helper")({
  component: () => null,
});
