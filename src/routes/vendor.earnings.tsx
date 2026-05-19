import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { VendorShell } from "@/components/vendor-shell";
import {
  getMyEarnings,
  getMyPayouts,
  requestPayout,
  cancelPayoutRequest,
} from "@/lib/payouts.functions";
import { PayoutStatusTimeline, type PayoutStatus } from "@/components/payout-timeline";
import { formatKobo } from "@/lib/currency";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/vendor/earnings")({
  component: VendorEarnings,
});

function VendorEarnings() {
  const fetchEarnings = useServerFn(getMyEarnings);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-earnings"],
    queryFn: () => fetchEarnings(),
  });
  const fetchPayouts = useServerFn(getMyPayouts);
  const { data: pData } = useQuery({
    queryKey: ["my-payouts"],
    queryFn: () => fetchPayouts(),
  });


  return (
    <VendorShell title="Earnings & Payouts" subtitle="Your sales, balance, and withdrawal history">
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive">
          {(error as Error).message}
        </p>
      )}
      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Stat label="Total balance" value={formatKobo(data.balance_kobo)} />
            <Stat
              label="Pending payouts"
              value={formatKobo(data.pending_payout_kobo)}
              muted
            />
            <Stat
              label="Available to withdraw"
              value={formatKobo(data.available_kobo)}
              highlight
            />
          </div>

          <div className="flex justify-end">
            <RequestPayoutDialog
              availableKobo={data.available_kobo}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ["my-earnings"] });
                qc.invalidateQueries({ queryKey: ["my-payouts"] });
              }}
            />
          </div>

          {pData && pData.payouts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Withdrawal requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {pData.payouts.map((p) => (
                  <div key={p.id} className="rounded border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-semibold">{formatKobo(p.amount_kobo)}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.bank_name} · ****{String(p.account_number ?? "").slice(-4)}
                      </span>
                    </div>
                    <PayoutStatusTimeline
                      status={p.status as PayoutStatus}
                      createdAt={p.created_at}
                      processedAt={p.processed_at}
                      failureReason={p.failure_reason}
                      reference={p.paystack_transfer_ref}
                      compact
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}



          <Card>
            <CardHeader>
              <CardTitle>Ledger</CardTitle>
            </CardHeader>
            <CardContent>
              {data.ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <div className="space-y-1 text-sm">
                  {data.ledger.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between border-b py-2 last:border-0"
                    >
                      <div>
                        <Badge variant="outline" className="mr-2">
                          {l.entry_type}
                        </Badge>
                        <span className="text-muted-foreground">{l.note ?? ""}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span
                          className={
                            l.amount_kobo >= 0 ? "text-emerald-600" : "text-destructive"
                          }
                        >
                          {l.amount_kobo >= 0 ? "+" : "−"}
                          {formatKobo(Math.abs(l.amount_kobo))}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(l.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Need to update bank details?{" "}
            <Link to="/vendor/profile" className="underline">
              Go to Profile & Bank
            </Link>
            .
          </p>
        </div>
      )}
    </VendorShell>
  );
}

function Stat({
  label,
  value,
  highlight,
  muted,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary" : undefined}>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p
          className={`mt-1 text-2xl font-semibold ${
            muted ? "text-muted-foreground" : ""
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function RequestPayoutDialog({
  availableKobo,
  onDone,
}: {
  availableKobo: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [acctNum, setAcctNum] = useState("");
  const [acctName, setAcctName] = useState("");

  const req = useServerFn(requestPayout);
  const m = useMutation({
    mutationFn: () =>
      req({
        data: {
          amount_kobo: Math.round(Number(amount) * 100),
          bank_name: bankName || undefined,
          bank_code: bankCode || undefined,
          account_number: acctNum || undefined,
          account_name: acctName || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Payout requested");
      setOpen(false);
      setAmount("");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={availableKobo <= 0}>Request payout</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request payout</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Amount (NGN)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Max ${formatKobo(availableKobo)}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Bank name</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
            <div>
              <Label>Bank code</Label>
              <Input value={bankCode} onChange={(e) => setBankCode(e.target.value)} />
            </div>
            <div>
              <Label>Account #</Label>
              <Input value={acctNum} onChange={(e) => setAcctNum(e.target.value)} />
            </div>
            <div>
              <Label>Account name</Label>
              <Input value={acctName} onChange={(e) => setAcctName(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !amount}>
            {m.isPending ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Keep unused import warning quiet
void cancelPayoutRequest;
