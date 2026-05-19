import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { VendorShell } from "@/components/vendor-shell";
import { listOrdersAdmin, updateOrderStatusAdmin } from "@/lib/checkout.functions";
import { formatNaira } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useAuth } from "@/auth/AuthProvider";
import { Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["pending", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"] as const;
type Status = typeof STATUSES[number];

const STATUS_VARIANT: Record<Status, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  paid: "default",
  processing: "secondary",
  shipped: "secondary",
  delivered: "default",
  cancelled: "destructive",
  refunded: "destructive",
};

export const Route = createFileRoute("/admin/orders")({
  component: AdminOrdersPage,
  head: () => ({ meta: [{ title: "Orders — ecove Admin" }] }),
});

function AdminOrdersPage() {
  const { hasRole, user, loading } = useAuth();
  const isAdmin = hasRole("admin");
  const [filter, setFilter] = useState<Status | "all">("all");
  const qc = useQueryClient();

  const fetchOrders = useServerFn(listOrdersAdmin);
  const updateFn = useServerFn(updateOrderStatusAdmin);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders", filter],
    queryFn: () => fetchOrders({ data: filter === "all" ? {} : { status: filter } }),
    enabled: isAdmin,
  });

  const update = useMutation({
    mutationFn: (vars: { order_id: string; status: Status }) => updateFn({ data: vars }),
    onSuccess: () => {
      toast.success("Order updated");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (loading) return <VendorShell title="Orders"><div className="p-10">Loading…</div></VendorShell>;
  if (!user || !isAdmin) {
    return (
      <VendorShell title="Orders" subtitle="Admin only">
        <div className="mx-auto max-w-md rounded-lg border p-8 text-center">
          <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-semibold">Admins only</p>
        </div>
      </VendorShell>
    );
  }

  const orders = data?.orders ?? [];

  return (
    <VendorShell title="Orders" subtitle="Manage payment & fulfilment status">
      <div className="mb-4 flex items-center gap-3">
        <Select value={filter} onValueChange={(v) => setFilter(v as Status | "all")}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["admin-orders"] })}
        >
          <RefreshCw className="mr-1 h-4 w-4" /> Refresh
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">
          {data?.total ?? 0} orders
        </span>
      </div>

      {isLoading && <div className="p-10 text-center">Loading…</div>}

      <div className="space-y-3">
        {orders.map((o) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const order = o as any;
          const status = order.status as Status;
          return (
            <div key={order.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm font-semibold">{order.order_number}</span>
                <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
                <span className="text-sm text-muted-foreground">
                  {new Date(order.created_at).toLocaleString()}
                </span>
                <span className="ml-auto font-semibold">{formatNaira(order.total_kobo)}</span>
              </div>
              {order.shipping_snapshot && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Ship to: {order.shipping_snapshot.full_name}, {order.shipping_snapshot.city}, {order.shipping_snapshot.state}
                </p>
              )}
              <ul className="mt-2 space-y-1 text-sm">
                {(order.items ?? []).map((i: { id: string; product_title: string; quantity: number; unit_price_kobo: number }) => (
                  <li key={i.id} className="flex justify-between">
                    <span>{i.product_title} × {i.quantity}</span>
                    <span className="text-muted-foreground">{formatNaira(i.unit_price_kobo * i.quantity)}</span>
                  </li>
                ))}
              </ul>
              {order.paystack_reference && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Paystack ref: <span className="font-mono">{order.paystack_reference}</span>
                </p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <Select
                  value={status}
                  onValueChange={(v) => update.mutate({ order_id: order.id, status: v as Status })}
                >
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
        {orders.length === 0 && !isLoading && (
          <p className="py-10 text-center text-muted-foreground">No orders found.</p>
        )}
      </div>
    </VendorShell>
  );
}
