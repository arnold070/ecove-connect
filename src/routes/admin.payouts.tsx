import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin-shell";
import {
  listPayoutsAdmin,
  approvePayoutAdmin,
  rejectPayoutAdmin,
} from "@/lib/payouts.functions";
import {
  listRefundsAdmin,
  decideRefundAdmin,
} from "@/lib/orders.functions";
import { formatKobo } from "@/lib/currency";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/payouts")({
  component: AdminPayoutsPage,
});

function AdminPayoutsPage() {
  return (
    <AdminShell title="Payouts & Refunds" subtitle="Approve vendor withdrawals and refund requests">
      <Tabs defaultValue="payouts">
        <TabsList>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
          <TabsTrigger value="refunds">Refunds</TabsTrigger>
        </TabsList>
        <TabsContent value="payouts" className="mt-4">
          <PayoutsTab />
        </TabsContent>
        <TabsContent value="refunds" className="mt-4">
          <RefundsTab />
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}

function PayoutsTab() {
  const fetchFn = useServerFn(listPayoutsAdmin);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: () => fetchFn({ data: {} }),
  });
  const approve = useServerFn(approvePayoutAdmin);
  const reject = useServerFn(rejectPayoutAdmin);

  const approveM = useMutation({
    mutationFn: (id: string) => approve({ data: { id } }),
    onSuccess: (r) => {
      toast.success(`Payout ${r.status}`);
      qc.invalidateQueries({ queryKey: ["admin-payouts"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const rejectM = useMutation({
    mutationFn: (v: { id: string; note?: string }) =>
      reject({ data: { id: v.id, note: v.note } }),
    onSuccess: () => {
      toast.success("Rejected");
      qc.invalidateQueries({ queryKey: ["admin-payouts"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-3">
      {data?.payouts.length === 0 && (
        <p className="text-sm text-muted-foreground">No payout requests.</p>
      )}
      {data?.payouts.map((p) => (
        <Card key={p.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(p as any).vendor?.business_name ?? "Vendor"}
              </CardTitle>
              <Badge variant="outline">{p.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-semibold">{formatKobo(p.amount_kobo)}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(p.created_at).toLocaleString()}
              </span>
            </div>
            <p className="text-muted-foreground">
              {p.bank_name} · {p.account_number} ({p.account_name})
            </p>
            {p.paystack_transfer_ref && (
              <p className="text-xs">Transfer ref: {p.paystack_transfer_ref}</p>
            )}
            {p.failure_reason && (
              <p className="text-xs text-destructive">{p.failure_reason}</p>
            )}
            {["requested", "approved"].includes(p.status) && (
              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={() => approveM.mutate(p.id)} disabled={approveM.isPending}>
                  Approve & Pay
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const note = window.prompt("Rejection reason?");
                    if (note) rejectM.mutate({ id: p.id, note });
                  }}
                >
                  Reject
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RefundsTab() {
  const fetchFn = useServerFn(listRefundsAdmin);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-refunds"],
    queryFn: () => fetchFn(),
  });
  const decide = useServerFn(decideRefundAdmin);
  const m = useMutation({
    mutationFn: (v: { id: string; approve: boolean; note?: string }) =>
      decide({ data: v }),
    onSuccess: (r) => {
      toast.success(`Refund ${r.status}`);
      qc.invalidateQueries({ queryKey: ["admin-refunds"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-3">
      {data?.refunds.length === 0 && (
        <p className="text-sm text-muted-foreground">No refund requests.</p>
      )}
      {data?.refunds.map((r) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const it = (r as any).item;
        return (
          <Card key={r.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {it?.product_title} × {it?.quantity}
                </CardTitle>
                <Badge variant="outline">{r.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Order {it?.order?.order_number} · {formatKobo(it?.vendor_payout_kobo ?? 0)}
              </p>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p className="italic">"{r.reason}"</p>
              {r.status === "requested" && (
                <>
                  <Textarea
                    value={notes[r.id] ?? ""}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [r.id]: e.target.value }))
                    }
                    placeholder="Optional admin note"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        m.mutate({ id: r.id, approve: true, note: notes[r.id] })
                      }
                      disabled={m.isPending}
                    >
                      Approve & Refund
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        m.mutate({ id: r.id, approve: false, note: notes[r.id] })
                      }
                      disabled={m.isPending}
                    >
                      Reject
                    </Button>
                  </div>
                </>
              )}
              {r.admin_note && (
                <p className="text-xs text-muted-foreground">Note: {r.admin_note}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
