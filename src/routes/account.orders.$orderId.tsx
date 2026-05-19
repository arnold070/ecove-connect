import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyOrder,
  confirmDelivery,
  requestRefund,
} from "@/lib/orders.functions";
import { formatKobo } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SiteHeader } from "@/components/site-header";
import { toast } from "sonner";

export const Route = createFileRoute("/account/orders/$orderId")({
  component: OrderDetail,
});

function OrderDetail() {
  const { orderId } = Route.useParams();
  const fn = useServerFn(getMyOrder);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-order", orderId],
    queryFn: () => fn({ data: { order_id: orderId } }),
  });
  const confirm = useServerFn(confirmDelivery);
  const confirmM = useMutation({
    mutationFn: (id: string) => confirm({ data: { order_item_id: id } }),
    onSuccess: () => {
      toast.success("Delivery confirmed");
      qc.invalidateQueries({ queryKey: ["my-order", orderId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Link to="/account/orders" className="text-sm text-muted-foreground hover:underline">
          ← All orders
        </Link>
        {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="mt-4 text-sm text-destructive">{(error as Error).message}</p>}
        {data && (
          <>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(() => { const order = data.order as any; const refunds = data.refunds; return (
              <>
                <div className="my-4 flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-semibold">{order.order_number}</h1>
                    <p className="text-xs text-muted-foreground">
                      Placed {new Date(order.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="outline">{order.status}</Badge>
                </div>

                <Card className="mb-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Shipping to</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {order.shipping_snapshot?.full_name}
                    <br />
                    {order.shipping_snapshot?.address_line1}
                    {order.shipping_snapshot?.address_line2 ? (
                      <>, {order.shipping_snapshot.address_line2}</>
                    ) : null}
                    <br />
                    {order.shipping_snapshot?.city}, {order.shipping_snapshot?.state},{" "}
                    {order.shipping_snapshot?.country}
                  </CardContent>
                </Card>

                <div className="space-y-3">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {order.items.map((it: any) => {
                    const rf = refunds.find((r) => r.order_item_id === it.id);
                    return (
                      <Card key={it.id}>
                        <CardContent className="space-y-2 p-4 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              {it.product_title} <span className="text-muted-foreground">× {it.quantity}</span>
                            </span>
                            <span>{formatKobo(it.unit_price_kobo * it.quantity)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              Fulfillment: <Badge variant="outline" className="ml-1">{it.fulfillment_status}</Badge>
                            </span>
                            {it.tracking_ref && (
                              <span>
                                {it.tracking_carrier} {it.tracking_ref}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {it.fulfillment_status === "shipped" && (
                              <Button size="sm" onClick={() => confirmM.mutate(it.id)}>
                                Confirm delivery
                              </Button>
                            )}
                            {!rf && ["delivered", "shipped"].includes(it.fulfillment_status) && (
                              <RefundDialog
                                orderItemId={it.id}
                                onDone={() => qc.invalidateQueries({ queryKey: ["my-order", orderId] })}
                              />
                            )}
                            {rf && (
                              <Badge variant="secondary">
                                Refund: {rf.status}
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                <Card className="mt-4">
                  <CardContent className="space-y-1 p-4 text-sm">
                    <Row label="Subtotal" value={formatKobo(order.subtotal_kobo)} />
                    <Row label="Shipping" value={formatKobo(order.shipping_kobo)} />
                    {order.discount_kobo > 0 && (
                      <Row label="Discount" value={`−${formatKobo(order.discount_kobo)}`} />
                    )}
                    <Row label="Total" value={formatKobo(order.total_kobo)} bold />
                  </CardContent>
                </Card>
              </>
            ); })()}
          </>
        )}
      </main>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function RefundDialog({ orderItemId, onDone }: { orderItemId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const req = useServerFn(requestRefund);
  const m = useMutation({
    mutationFn: () => req({ data: { order_item_id: orderItemId, reason } }),
    onSuccess: () => {
      toast.success("Refund requested");
      setOpen(false);
      setReason("");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Request refund
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request refund</DialogTitle>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Tell us what went wrong"
          rows={4}
        />
        <DialogFooter>
          <Button onClick={() => m.mutate()} disabled={m.isPending || reason.length < 5}>
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
