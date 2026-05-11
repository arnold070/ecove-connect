import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PlusCircle, Package } from "lucide-react";

import { VendorShell } from "@/components/vendor-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { listMyProducts, type ProductStatus } from "@/lib/products.functions";
import { formatKobo } from "@/lib/currency";

export const Route = createFileRoute("/vendor/products/")({
  component: ProductsListPage,
  head: () => ({ meta: [{ title: "My products — Vendor — ecove" }] }),
});

const TABS: { value: ProductStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
];

function ProductsListPage() {
  const [status, setStatus] = useState<ProductStatus | "all">("all");
  const list = useServerFn(listMyProducts);
  const { data, isLoading } = useQuery({
    queryKey: ["my-products", status],
    queryFn: () =>
      list({
        data: { status: status === "all" ? undefined : status, page: 1, pageSize: 50 },
      }),
  });

  return (
    <VendorShell
      title="My products"
      subtitle="Drafts, pending review, live, and rejected"
      primaryAction={{ label: "Add product", to: "/vendor/products/new" }}
    >
      <Tabs value={status} onValueChange={(v) => setStatus(v as ProductStatus | "all")}>
        <TabsList className="mb-4">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !data?.products.length ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <Package className="h-8 w-8" />
              No products in this view yet.
              <Button asChild size="sm">
                <Link to="/vendor/products/new">
                  <PlusCircle className="h-4 w-4" /> Add your first product
                </Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Title</th>
                    <th className="px-4 py-3 font-semibold">Price</th>
                    <th className="px-4 py-3 font-semibold">Stock</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((p) => (
                    <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">{p.title}</td>
                      <td className="px-4 py-3">{formatKobo(p.price_kobo)}</td>
                      <td className="px-4 py-3">{p.stock}</td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(p.updated_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </VendorShell>
  );
}

function StatusBadge({ status }: { status: ProductStatus }) {
  const map: Record<ProductStatus, string> = {
    draft: "bg-muted text-muted-foreground",
    pending: "bg-warning/20 text-warning-foreground",
    approved: "bg-success/15 text-success",
    rejected: "bg-destructive/15 text-destructive",
    suspended: "bg-destructive/15 text-destructive",
    archived: "bg-muted text-muted-foreground",
  };
  return (
    <Badge className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[status]}`}>
      {status}
    </Badge>
  );
}
