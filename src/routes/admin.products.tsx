import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Clock,
  Package,
  Pause,
  Play,
} from "lucide-react";

import { AdminShell } from "@/components/admin-shell";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatKobo } from "@/lib/currency";
import {
  listProductsAdmin,
  getProductAdmin,
  approveProduct,
  rejectProduct,
  suspendProduct,
  reinstateProduct,
  type ProductStatus,
} from "@/lib/products.functions";

export const Route = createFileRoute("/admin/products")({
  component: AdminProductsPage,
  head: () => ({ meta: [{ title: "Product moderation — admin" }] }),
});

function AdminProductsPage() {
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
      <AdminShell title="Product moderation" subtitle="Admin only">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
          You don&apos;t have permission to view this page.
        </div>
      </AdminShell>
    );
  }
  return <Inner />;
}

function Inner() {
  const [status, setStatus] = useState<ProductStatus>("pending");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const list = useServerFn(listProductsAdmin);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-products", status, search],
    queryFn: () => list({ data: { status, search: search || undefined, page: 1, pageSize: 50 } }),
  });

  if (selected) return <Detail id={selected} onBack={() => setSelected(null)} />;

  return (
    <AdminShell title="Product moderation" subtitle="Approve, reject, or suspend vendor products">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={status} onValueChange={(v) => setStatus(v as ProductStatus)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["pending","approved","rejected","suspended","draft","archived"] as ProductStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title…"
          className="max-w-xs"
        />
        <Badge variant="outline">{data?.total ?? 0} total</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !data?.products.length ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Package className="h-8 w-8" />
              No products with status &quot;{status}&quot;
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Product</th>
                    <th className="px-4 py-3 font-semibold">Vendor</th>
                    <th className="px-4 py-3 font-semibold">Price</th>
                    <th className="px-4 py-3 font-semibold">Submitted</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(data.products as any[]).map((p) => (
                    <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">{p.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.vendors?.store_name ?? "—"}</td>
                      <td className="px-4 py-3">{formatKobo(p.price_kobo)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.submitted_at ? new Date(p.submitted_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="outline" size="sm" onClick={() => setSelected(p.id)}>
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const get = useServerFn(getProductAdmin);
  const approve = useServerFn(approveProduct);
  const reject = useServerFn(rejectProduct);
  const suspend = useServerFn(suspendProduct);
  const reinstate = useServerFn(reinstateProduct);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-product", id],
    queryFn: () => get({ data: { id } }),
  });

  const [rejectOpen, setRejectOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState("");

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-products"] });
    void qc.invalidateQueries({ queryKey: ["admin-product", id] });
  };

  const approveMut = useMutation({
    mutationFn: () => approve({ data: { id } }),
    onSuccess: () => { toast.success("Product approved"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rejectMut = useMutation({
    mutationFn: () => reject({ data: { id, reason } }),
    onSuccess: () => { toast.success("Product rejected"); setRejectOpen(false); setReason(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const suspendMut = useMutation({
    mutationFn: () => suspend({ data: { id, reason } }),
    onSuccess: () => { toast.success("Product suspended"); setSuspendOpen(false); setReason(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reinstateMut = useMutation({
    mutationFn: () => reinstate({ data: { id } }),
    onSuccess: () => { toast.success("Product reinstated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <AdminShell title="Review product" subtitle="Loading…">
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      </AdminShell>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = data.product as any;
  const status: ProductStatus = p.status;

  return (
    <AdminShell title={p.title} subtitle={`Vendor • ${p.vendors?.store_name ?? "—"}`}>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Product</CardTitle>
              <Badge variant="outline">{status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Row k="Price" val={formatKobo(p.price_kobo)} />
            <Row k="Stock" val={String(p.stock)} />
            <Row k="SKU" val={p.sku} />
            <Row k="Description" val={p.description} />
            {p.rejection_reason ? <Row k="Rejection reason" val={p.rejection_reason} /> : null}

            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Images ({data.images.length})</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {data.images.map((img: any) => (
                  <a
                    key={img.id}
                    href={img.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-square overflow-hidden rounded-md border border-border bg-muted"
                  >
                    <img src={img.url} alt={img.alt ?? ""} className="h-full w-full object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            </div>

            {data.variants.length > 0 ? (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Variants ({data.variants.length})</p>
                <ul className="space-y-1 text-xs">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {data.variants.map((v: any) => (
                    <li key={v.id} className="flex items-center justify-between rounded border border-border bg-muted/40 px-3 py-1.5">
                      <span className="font-semibold">{v.name}</span>
                      <span className="text-muted-foreground">
                        {v.price_kobo ? formatKobo(v.price_kobo) : "—"} · stock {v.stock} · sku {v.sku ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Decision</CardTitle>
              <CardDescription>
                Status transitions: draft → pending → approved/rejected. Approved products can be suspended.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {status === "pending" || status === "draft" ? (
                <>
                  <Button className="w-full" onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>
                    {approveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Approve
                  </Button>
                  <Button variant="destructive" className="w-full" onClick={() => setRejectOpen(true)}>
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                </>
              ) : null}
              {status === "approved" ? (
                <Button variant="destructive" className="w-full" onClick={() => setSuspendOpen(true)}>
                  <Pause className="h-4 w-4" /> Suspend
                </Button>
              ) : null}
              {status === "suspended" || status === "rejected" ? (
                <Button className="w-full" onClick={() => reinstateMut.mutate()} disabled={reinstateMut.isPending}>
                  {reinstateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Reinstate
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Audit trail</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              {data.audit.length === 0 ? (
                <p className="text-muted-foreground">No actions yet</p>
              ) : (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data.audit.map((a: any) => (
                  <div key={a.id} className="flex items-start gap-2">
                    <Clock className="mt-0.5 h-3 w-3 text-muted-foreground" />
                    <div>
                      <p className="font-semibold text-foreground">{a.action}</p>
                      {a.note ? <p className="text-muted-foreground">{a.note}</p> : null}
                      <p className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject product"
        description="Provide a reason. The vendor will see this and can edit + resubmit."
        reason={reason}
        setReason={setReason}
        onConfirm={() => rejectMut.mutate()}
        loading={rejectMut.isPending}
        confirmLabel="Confirm rejection"
      />
      <ReasonDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        title="Suspend product"
        description="The product will be hidden from the storefront and removed from active carts."
        reason={reason}
        setReason={setReason}
        onConfirm={() => suspendMut.mutate()}
        loading={suspendMut.isPending}
        confirmLabel="Confirm suspension"
      />
    </AdminShell>
  );
}

function ReasonDialog({
  open, onOpenChange, title, description, reason, setReason, onConfirm, loading, confirmLabel,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  title: string;
  description: string;
  reason: string;
  setReason: (s: string) => void;
  onConfirm: () => void;
  loading: boolean;
  confirmLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={500} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading || reason.trim().length < 3}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, val }: { k: string; val: string | null | undefined }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-border/40 pb-2 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className="col-span-2 whitespace-pre-wrap text-foreground">
        {val || <span className="text-muted-foreground">—</span>}
      </span>
    </div>
  );
}
