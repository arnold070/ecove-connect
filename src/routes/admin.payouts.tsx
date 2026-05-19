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
import {
  PayoutStatusTimeline,
  RefundStatusTimeline,
  type PayoutStatus,
  type RefundStatus,
} from "@/components/payout-timeline";
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
            <PayoutStatusTimeline
              status={p.status as PayoutStatus}
              createdAt={p.created_at}
              processedAt={(p as { processed_at?: string | null }).processed_at}
              failureReason={p.failure_reason}
              reference={p.paystack_transfer_ref}
              compact
            />
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
  const exportFn = useServerFn(exportRefundsCsvAdmin);
  const qc = useQueryClient();
  const [filters, setFilters] = useState<{
    status?: string;
    from?: string;
    to?: string;
    order_number?: string;
    buyer_email?: string;
  }>({});

  const apiFilters = {
    status: filters.status && filters.status !== "all" ? filters.status : undefined,
    from: filters.from ? new Date(filters.from).toISOString() : undefined,
    to: filters.to ? new Date(filters.to).toISOString() : undefined,
    order_number: filters.order_number?.trim() || undefined,
    buyer_email: filters.buyer_email?.trim() || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["admin-refunds", apiFilters],
    queryFn: () => fetchFn({ data: { filters: apiFilters } }),
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
  const [exporting, setExporting] = useState(false);

  async function downloadCsv() {
    setExporting(true);
    try {
      const res = await exportFn({ data: { filters: apiFilters } });
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${res.count} rows`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const refunds = (data?.refunds ?? []) as Array<{
    id: string;
    reason: string;
    status: string;
    admin_note: string | null;
    created_at: string;
    updated_at: string | null;
    processed_at: string | null;
    buyer_email?: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    item: any;
  }>;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-6">
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={filters.status ?? "all"}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="all">All statuses</option>
            <option value="requested">Requested</option>
            <option value="approved">Approved</option>
            <option value="refunded">Refunded</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input
            type="date"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={filters.from ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          />
          <input
            type="date"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={filters.to ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          />
          <input
            type="text"
            placeholder="Order #"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={filters.order_number ?? ""}
            onChange={(e) =>
              setFilters((f) => ({ ...f, order_number: e.target.value }))
            }
          />
          <input
            type="email"
            placeholder="Buyer email"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={filters.buyer_email ?? ""}
            onChange={(e) =>
              setFilters((f) => ({ ...f, buyer_email: e.target.value }))
            }
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilters({})}
              className="flex-1"
            >
              Reset
            </Button>
            <Button size="sm" onClick={downloadCsv} disabled={exporting} className="flex-1">
              {exporting ? "…" : "Export CSV"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && refunds.length === 0 && (
        <p className="text-sm text-muted-foreground">No refund requests match.</p>
      )}
      {refunds.map((r) => {
        const it = r.item;
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
                {r.buyer_email ? ` · ${r.buyer_email}` : ""}
              </p>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              <p className="italic">"{r.reason}"</p>
              <RefundStatusTimeline
                status={r.status as RefundStatus}
                createdAt={r.created_at}
                updatedAt={r.updated_at}
                processedAt={r.processed_at}
                adminNote={r.admin_note}
              />
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
