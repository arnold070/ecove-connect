import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Clock, PlusCircle } from "lucide-react";
import { VendorShell } from "@/components/vendor-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listMyProducts } from "@/lib/products.functions";
import { formatKobo } from "@/lib/currency";

export const Route = createFileRoute("/vendor/products/pending")({
  component: PendingProductsPage,
  head: () => ({ meta: [{ title: "Pending approval — Vendor — ecove" }] }),
});

function PendingProductsPage() {
  const list = useServerFn(listMyProducts);
  const { data, isLoading } = useQuery({
    queryKey: ["my-products", "pending"],
    queryFn: () => list({ data: { status: "pending", page: 1, pageSize: 50 } }),
  });

  return (
    <VendorShell
      title="Pending approval"
      subtitle="Products waiting on admin review"
      primaryAction={{ label: "Add product", to: "/vendor/products/new" }}
    >
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !data?.products.length ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <Clock className="h-8 w-8" />
              No products awaiting review.
              <Button asChild size="sm">
                <Link to="/vendor/products/new">
                  <PlusCircle className="h-4 w-4" /> Add a product
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.products.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Submitted{" "}
                      {p.submitted_at ? new Date(p.submitted_at).toLocaleString() : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatKobo(p.price_kobo)}</p>
                    <p className="text-xs text-muted-foreground">stock: {p.stock}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </VendorShell>
  );
}
