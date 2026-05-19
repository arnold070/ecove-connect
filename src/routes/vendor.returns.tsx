import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { VendorShell } from "@/components/vendor-shell";
import { listMyVendorRefunds } from "@/lib/orders.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatKobo } from "@/lib/currency";
import { RefundStatusTimeline, type RefundStatus } from "@/components/payout-timeline";

export const Route = createFileRoute("/vendor/returns")({
  component: VendorReturns,
});

function VendorReturns() {
  const fetchFn = useServerFn(listMyVendorRefunds);
  const { data, isLoading, error } = useQuery({
    queryKey: ["vendor-refunds"],
    queryFn: () => fetchFn(),
  });

  return (
    <VendorShell title="Returns & Refunds" subtitle="Refund requests on your items">
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {data && data.refunds.length === 0 && (
        <p className="text-sm text-muted-foreground">No refund requests yet.</p>
      )}
      <div className="space-y-3">
        {data?.refunds.map((r) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const it = (r as any).item;
          return (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {it?.product_title}{" "}
                    <span className="text-muted-foreground">× {it?.quantity}</span>
                  </CardTitle>
                  <Badge variant="outline">{r.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Order{" "}
                  <Link
                    to="/vendor/orders"
                    className="font-mono hover:underline"
                  >
                    {it?.order?.order_number}
                  </Link>{" "}
                  · Payout impact {formatKobo(it?.vendor_payout_kobo ?? 0)}
                </p>
              </CardHeader>
              <CardContent className="text-sm space-y-3">
                <p className="italic">"{r.reason}"</p>
                <RefundStatusTimeline
                  status={r.status as RefundStatus}
                  createdAt={r.created_at}
                  updatedAt={(r as { updated_at?: string | null }).updated_at}
                  processedAt={(r as { processed_at?: string | null }).processed_at}
                  adminNote={r.admin_note}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </VendorShell>
  );
}
