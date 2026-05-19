import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyOrders } from "@/lib/checkout.functions";
import { formatKobo } from "@/lib/currency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/account/orders")({
  component: AccountOrders,
});

function AccountOrders() {
  const fn = useServerFn(listMyOrders);
  const { data, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => fn(),
  });
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold">My orders</h1>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {data?.orders.length === 0 && (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        )}
        <div className="space-y-3">
          {data?.orders.map((o) => (
            <Link
              key={o.id}
              to="/account/orders/$orderId"
              params={{ orderId: o.id }}
            >
              <Card className="transition hover:border-primary">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{o.order_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString()} ·{" "}
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(o as any).items?.length ?? 0} item(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{o.status}</Badge>
                    <span className="font-semibold">{formatKobo(o.total_kobo)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
