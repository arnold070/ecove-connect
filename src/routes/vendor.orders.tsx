import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { VendorShell } from "@/components/vendor-shell";
import {
  listMyVendorOrders,
  markItemShipped,
  markItemDelivered,
} from "@/lib/payouts.functions";
import { formatKobo } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/vendor/orders")({
  component: VendorOrders,
});

function VendorOrders() {
  const fetchOrders = useServerFn(listMyVendorOrders);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-vendor-orders"],
    queryFn: () => fetchOrders(),
  });

  const ship = useServerFn(markItemShipped);
  const deliver = useServerFn(markItemDelivered);

  const shipM = useMutation({
    mutationFn: (vars: { id: string; carrier?: string; ref?: string }) =>
      ship({
        data: {
          order_item_id: vars.id,
          tracking_carrier: vars.carrier,
          tracking_ref: vars.ref,
        },
      }),
    onSuccess: () => {
      toast.success("Marked shipped");
      qc.invalidateQueries({ queryKey: ["my-vendor-orders"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const deliverM = useMutation({
    mutationFn: (id: string) => deliver({ data: { order_item_id: id } }),
    onSuccess: () => {
      toast.success("Marked delivered");
      qc.invalidateQueries({ queryKey: ["my-vendor-orders"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <VendorShell title="My Orders" subtitle="Fulfil customer orders">
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {data && (
        <div className="space-y-3">
          {data.items.length === 0 && (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          )}
          {data.items.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              onShip={(carrier, ref) =>
                shipM.mutate({ id: it.id, carrier, ref })
              }
              onDeliver={() => deliverM.mutate(it.id)}
            />
          ))}
        </div>
      )}
    </VendorShell>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ItemCard({ item, onShip, onDeliver }: { item: any; onShip: (c?: string, r?: string) => void; onDeliver: () => void }) {
  const [carrier, setCarrier] = useState("");
  const [ref, setRef] = useState("");
  const order = item.order;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {item.product_title}{" "}
            <span className="text-sm text-muted-foreground">× {item.quantity}</span>
          </CardTitle>
          <Badge variant="outline">{item.fulfillment_status}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Order {order?.order_number} · payout {formatKobo(item.vendor_payout_kobo)}
        </p>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        {item.fulfillment_status === "pending" && order?.status === "paid" && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs">Carrier</label>
              <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} className="h-8 w-32" />
            </div>
            <div>
              <label className="text-xs">Tracking #</label>
              <Input value={ref} onChange={(e) => setRef(e.target.value)} className="h-8 w-40" />
            </div>
            <Button size="sm" onClick={() => onShip(carrier || undefined, ref || undefined)}>
              Mark shipped
            </Button>
          </div>
        )}
        {item.fulfillment_status === "shipped" && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {item.tracking_carrier} {item.tracking_ref}
            </span>
            <Button size="sm" variant="outline" onClick={onDeliver}>
              Mark delivered
            </Button>
          </div>
        )}
        {item.fulfillment_status === "delivered" && (
          <p className="text-muted-foreground">
            Delivered{" "}
            {item.delivered_at &&
              new Date(item.delivered_at).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
