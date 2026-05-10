import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeft,
  ExternalLink,
  Clock,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { VendorShell } from "@/components/vendor-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  listVendorsAdmin,
  getVendorAdmin,
  approveVendor,
  rejectVendor,
  type VendorRow,
  type VendorStatus,
} from "@/lib/vendors.functions";

export const Route = createFileRoute("/vendor/admin/approvals")({
  component: AdminApprovalsPage,
  head: () => ({
    meta: [{ title: "Vendor approvals — admin" }],
  }),
});

function AdminApprovalsPage() {
  const { user, loading, hasRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!hasRole("admin")) {
    return (
      <VendorShell title="Vendor approvals" subtitle="Admin only">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
          You don&apos;t have permission to view this page.
        </div>
      </VendorShell>
    );
  }
  return <ApprovalsInner />;
}

function ApprovalsInner() {
  const [status, setStatus] = useState<VendorStatus>("pending");
  const [selected, setSelected] = useState<string | null>(null);
  const list = useServerFn(listVendorsAdmin);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-vendors", status],
    queryFn: () => list({ data: { status, page: 1, pageSize: 50 } }),
  });

  if (selected) {
    return <VendorDetail id={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <VendorShell
      title="Vendor approvals"
      subtitle="Review pending vendor applications and KYC documents"
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Status:</span>
        <Select value={status} onValueChange={(v) => setStatus(v as VendorStatus)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline">{data?.total ?? 0} total</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading vendors…
            </div>
          ) : !data?.vendors.length ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-8 w-8" />
              No vendors with status &quot;{status}&quot;
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Store</th>
                    <th className="px-4 py-3 font-semibold">Country</th>
                    <th className="px-4 py-3 font-semibold">Submitted</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.vendors.map((v) => (
                    <VendorRowItem key={v.id} v={v} onOpen={() => setSelected(v.id)} />
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

function VendorRowItem({ v, onOpen }: { v: VendorRow; onOpen: () => void }) {
  return (
    <tr className="border-b border-border/60 last:border-0 hover:bg-muted/30">
      <td className="px-4 py-3">
        <p className="font-semibold text-foreground">{v.store_name}</p>
        <p className="text-[11px] text-muted-foreground">{v.contact_email ?? v.slug}</p>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{v.country}</td>
      <td className="px-4 py-3 text-muted-foreground">
        {v.submitted_at ? new Date(v.submitted_at).toLocaleString() : "—"}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={v.status} />
      </td>
      <td className="px-4 py-3 text-right">
        <Button variant="outline" size="sm" onClick={onOpen}>
          Review <ExternalLink className="ml-1 h-3 w-3" />
        </Button>
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: VendorStatus }) {
  const map: Record<VendorStatus, string> = {
    draft: "bg-muted text-muted-foreground",
    pending: "bg-warning/20 text-warning-foreground",
    approved: "bg-success/15 text-success",
    rejected: "bg-destructive/15 text-destructive",
    suspended: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[status]}`}>
      {status}
    </span>
  );
}

function VendorDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const get = useServerFn(getVendorAdmin);
  const approve = useServerFn(approveVendor);
  const reject = useServerFn(rejectVendor);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-vendor", id],
    queryFn: () => get({ data: { id } }),
  });

  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const approveMut = useMutation({
    mutationFn: () => approve({ data: { id } }),
    onSuccess: () => {
      toast.success("Vendor approved");
      void qc.invalidateQueries({ queryKey: ["admin-vendors"] });
      void qc.invalidateQueries({ queryKey: ["admin-vendor", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: () => reject({ data: { id, reason } }),
    onSuccess: () => {
      toast.success("Vendor rejected");
      setRejectOpen(false);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["admin-vendors"] });
      void qc.invalidateQueries({ queryKey: ["admin-vendor", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <VendorShell title="Vendor review" subtitle="Loading…">
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      </VendorShell>
    );
  }

  const v = data.vendor;
  const isPending = v.status === "pending";

  return (
    <VendorShell title={v.store_name} subtitle={`Vendor • ${v.country}`}>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to queue
      </Button>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Business profile</CardTitle>
              <StatusBadge status={v.status} />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Row k="Store name" val={v.store_name} />
            <Row k="Slug" val={v.slug} />
            <Row k="Description" val={v.description} />
            <Row k="Reg. number" val={v.business_registration_number} />
            <Row k="Tax ID" val={v.tax_id} />
            <Row k="Address" val={v.business_address} />
            <Row k="City" val={v.city} />
            <Row k="Country" val={v.country} />
            <Row k="Contact email" val={v.contact_email} />
            <Row k="WhatsApp" val={v.whatsapp} />
            <Row
              k="Submitted"
              val={v.submitted_at ? new Date(v.submitted_at).toLocaleString() : "—"}
            />
            {v.rejection_reason ? (
              <Row k="Rejection reason" val={v.rejection_reason} />
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Decision</CardTitle>
              <CardDescription>
                {isPending
                  ? "Approve to grant 'vendor' role and unlock product listing."
                  : `Current status: ${v.status}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                className="w-full"
                onClick={() => approveMut.mutate()}
                disabled={approveMut.isPending || v.status === "approved"}
              >
                {approveMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Approve
              </Button>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setRejectOpen(true)}
                disabled={rejectMut.isPending || v.status === "rejected"}
              >
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit trail</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {data.audit.length === 0 ? (
                <p className="text-muted-foreground">No actions yet</p>
              ) : (
                data.audit.map((a: { id: string; action: string; note: string | null; created_at: string }) => (
                  <div key={a.id} className="flex items-start gap-2">
                    <Clock className="mt-0.5 h-3 w-3 text-muted-foreground" />
                    <div>
                      <p className="font-semibold text-foreground">{a.action}</p>
                      {a.note ? <p className="text-muted-foreground">{a.note}</p> : null}
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(a.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">KYC documents ({data.documents.length})</CardTitle>
          <CardDescription>Click to open in a new tab. Signed URLs expire in 10 minutes.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents uploaded.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.documents.map((d) => (
                <a
                  key={d.id}
                  href={d.signed_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 text-sm hover:border-primary"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{d.doc_type}</p>
                    <p className="text-[11px] text-muted-foreground">{d.status}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject vendor application</DialogTitle>
            <DialogDescription>
              Provide a clear reason. The vendor will see this and can resubmit.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="e.g. ID document is blurry — please re-upload a clearer scan."
            maxLength={500}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectMut.mutate()}
              disabled={rejectMut.isPending || reason.trim().length < 3}
            >
              {rejectMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </VendorShell>
  );
}

function Row({ k, val }: { k: string; val: string | null | undefined }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-border/40 pb-2 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className="col-span-2 text-foreground">{val || <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}
