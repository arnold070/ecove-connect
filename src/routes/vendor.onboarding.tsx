import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Upload,
  Trash2,
  ShieldCheck,
  Loader2,
  FileText,
  Building2,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { VendorShell } from "@/components/vendor-shell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getMyVendor,
  upsertVendorDraft,
  createKycUploadUrl,
  recordKycDocument,
  deleteKycDocument,
  submitVendorForReview,
  type KycDocType,
  type VendorStatus,
} from "@/lib/vendors.functions";

export const Route = createFileRoute("/vendor/onboarding")({
  component: VendorOnboardingPage,
  head: () => ({
    meta: [{ title: "Vendor onboarding — ecove" }],
  }),
});

const DOC_TYPES: { value: KycDocType; label: string; required: boolean }[] = [
  { value: "id_front", label: "Government ID (front)", required: true },
  { value: "id_back", label: "Government ID (back)", required: true },
  { value: "business_reg", label: "Business registration", required: false },
  { value: "tax_cert", label: "Tax certificate", required: false },
  { value: "address_proof", label: "Proof of address", required: false },
];

const COUNTRIES = ["Nigeria", "Ghana", "Kenya", "South Africa", "United Kingdom", "United States"];

const STATUS_BADGE: Record<VendorStatus, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  draft: { label: "Draft", tone: "bg-muted text-muted-foreground", Icon: FileText },
  pending: { label: "Pending review", tone: "bg-warning/20 text-warning-foreground", Icon: Clock },
  approved: { label: "Approved", tone: "bg-success/15 text-success", Icon: CheckCircle2 },
  rejected: { label: "Rejected", tone: "bg-destructive/15 text-destructive", Icon: XCircle },
  suspended: { label: "Suspended", tone: "bg-destructive/15 text-destructive", Icon: AlertTriangle },
};

function VendorOnboardingPage() {
  const { user, loading } = useAuth();
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

  return <OnboardingInner />;
}

function OnboardingInner() {
  const qc = useQueryClient();
  const fetchVendor = useServerFn(getMyVendor);
  const upsert = useServerFn(upsertVendorDraft);
  const submit = useServerFn(submitVendorForReview);

  const { data, isLoading } = useQuery({
    queryKey: ["my-vendor"],
    queryFn: () => fetchVendor(),
  });

  const vendor = data?.vendor ?? null;
  const documents = data?.documents ?? [];
  const status: VendorStatus = vendor?.status ?? "draft";
  const Locked = status === "approved" || status === "suspended";

  const [form, setForm] = useState({
    store_name: "",
    description: "",
    business_registration_number: "",
    tax_id: "",
    country: "Nigeria",
    city: "",
    business_address: "",
    contact_email: "",
    whatsapp: "",
  });

  // hydrate form whenever vendor loads
  useEffect(() => {
    if (vendor) {
      setForm({
        store_name: vendor.store_name ?? "",
        description: vendor.description ?? "",
        business_registration_number: vendor.business_registration_number ?? "",
        tax_id: vendor.tax_id ?? "",
        country: vendor.country ?? "Nigeria",
        city: vendor.city ?? "",
        business_address: vendor.business_address ?? "",
        contact_email: vendor.contact_email ?? "",
        whatsapp: vendor.whatsapp ?? "",
      });
    }
  }, [vendor]);

  const saveMut = useMutation({
    mutationFn: () => upsert({ data: form }),
    onSuccess: () => {
      toast.success("Profile saved");
      void qc.invalidateQueries({ queryKey: ["my-vendor"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitMut = useMutation({
    mutationFn: () => submit(),
    onSuccess: () => {
      toast.success("Submitted for review");
      void qc.invalidateQueries({ queryKey: ["my-vendor"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const docCount = documents.length;
  const requiredDone = useMemo(() => {
    const set = new Set(documents.map((d) => d.doc_type));
    return DOC_TYPES.filter((d) => d.required).every((d) => set.has(d.value));
  }, [documents]);

  const canSubmit = !!vendor && (status === "draft" || status === "rejected") && requiredDone;
  const badge = STATUS_BADGE[status];
  const BadgeIcon = badge.Icon;

  if (isLoading) {
    return (
      <VendorShell title="Vendor onboarding" subtitle="Set up your seller profile">
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      </VendorShell>
    );
  }

  return (
    <VendorShell
      title="Vendor onboarding & KYC"
      subtitle="Complete the steps below to start selling on ecove"
    >
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Account status</p>
            <h2 className="font-display text-lg font-bold text-foreground">
              {vendor?.store_name || "New vendor"}
            </h2>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${badge.tone}`}
        >
          <BadgeIcon className="h-3.5 w-3.5" />
          {badge.label}
        </span>
      </div>

      {status === "rejected" && vendor?.rejection_reason ? (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <XCircle className="mt-0.5 h-5 w-5 text-destructive" />
          <div className="text-sm">
            <p className="font-semibold text-destructive">Application rejected</p>
            <p className="mt-1 text-foreground">{vendor.rejection_reason}</p>
            <p className="mt-1 text-muted-foreground">
              Update your details and documents, then resubmit.
            </p>
          </div>
        </div>
      ) : null}

      {status === "pending" ? (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/15 p-4 text-sm">
          <Clock className="mt-0.5 h-5 w-5 text-warning-foreground" />
          <div>
            <p className="font-semibold text-foreground">Application under review</p>
            <p className="text-muted-foreground">
              Our team is reviewing your KYC. You&apos;ll be notified within 24–48 hours.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Step 1: Business details */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Business details</CardTitle>
            </div>
            <CardDescription>
              Tell buyers about your store. This information appears on your storefront.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Store name" required>
              <Input
                value={form.store_name}
                onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                placeholder="e.g. Ada Electronics"
                disabled={Locked}
                maxLength={120}
              />
            </Field>
            <Field label="Short description">
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What you sell, who you serve, your unique value"
                rows={3}
                disabled={Locked}
                maxLength={2000}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business reg. number">
                <Input
                  value={form.business_registration_number}
                  onChange={(e) =>
                    setForm({ ...form, business_registration_number: e.target.value })
                  }
                  placeholder="RC123456"
                  disabled={Locked}
                />
              </Field>
              <Field label="Tax ID / TIN">
                <Input
                  value={form.tax_id}
                  onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
                  placeholder="Optional"
                  disabled={Locked}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Country" required>
                <Select
                  value={form.country}
                  onValueChange={(v) => setForm({ ...form, country: v })}
                  disabled={Locked}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="City">
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  disabled={Locked}
                />
              </Field>
            </div>
            <Field label="Business address">
              <Textarea
                value={form.business_address}
                onChange={(e) => setForm({ ...form, business_address: e.target.value })}
                rows={2}
                disabled={Locked}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact email">
                <Input
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  disabled={Locked}
                />
              </Field>
              <Field label="WhatsApp">
                <Input
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  placeholder="+234…"
                  disabled={Locked}
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || Locked || !form.store_name.trim()}
              >
                {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {vendor ? "Save changes" : "Create profile"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Step 2: KYC documents + submit */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <KycCard
            vendorId={vendor?.id ?? null}
            documents={documents}
            disabled={Locked || !vendor}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Submit for review</CardTitle>
              <CardDescription>
                After saving your profile and uploading required documents, send your application
                to our review team.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Checklist
                items={[
                  { label: "Profile saved", done: !!vendor },
                  { label: "At least 2 KYC documents", done: docCount >= 2 },
                  { label: "Required ID documents uploaded", done: requiredDone },
                ]}
              />
              <Button
                className="w-full"
                onClick={() => submitMut.mutate()}
                disabled={submitMut.isPending || !canSubmit}
              >
                {submitMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {status === "rejected" ? "Resubmit application" : "Submit for review"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </VendorShell>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function Checklist({ items }: { items: { label: string; done: boolean }[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          {i.done ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <span className="h-4 w-4 rounded-full border border-muted-foreground/30" />
          )}
          <span className={i.done ? "text-foreground" : "text-muted-foreground"}>{i.label}</span>
        </li>
      ))}
    </ul>
  );
}

function KycCard({
  vendorId,
  documents,
  disabled,
}: {
  vendorId: string | null;
  documents: { id: string; doc_type: KycDocType; status: string; signed_url?: string }[];
  disabled: boolean;
}) {
  const qc = useQueryClient();
  const createUrl = useServerFn(createKycUploadUrl);
  const recordDoc = useServerFn(recordKycDocument);
  const removeDoc = useServerFn(deleteKycDocument);
  const [uploading, setUploading] = useState<KycDocType | null>(null);

  const handleUpload = async (docType: KycDocType, file: File) => {
    if (!vendorId) {
      toast.error("Save your profile first");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Max 5MB per file");
      return;
    }
    try {
      setUploading(docType);
      const { uploadUrl, token, path } = await createUrl({
        data: {
          vendor_id: vendorId,
          doc_type: docType,
          filename: file.name,
          content_type: file.type || "application/octet-stream",
        },
      });
      // Upload via supabase-js using the signed token (works in browser)
      const { error: upErr } = await supabase.storage
        .from("kyc-documents")
        .uploadToSignedUrl(path, token, file, {
          contentType: file.type || "application/octet-stream",
        });
      void uploadUrl; // included for completeness
      if (upErr) throw upErr;

      await recordDoc({ data: { vendor_id: vendorId, doc_type: docType, storage_path: path } });
      toast.success("Document uploaded");
      void qc.invalidateQueries({ queryKey: ["my-vendor"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await removeDoc({ data: { id } });
      toast.success("Removed");
      void qc.invalidateQueries({ queryKey: ["my-vendor"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">KYC documents</CardTitle>
        <CardDescription>
          PDF, JPG or PNG up to 5MB each. Files are private and only visible to admin reviewers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {DOC_TYPES.map((dt) => {
          const existing = documents.filter((d) => d.doc_type === dt.value);
          return (
            <div key={dt.value} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {dt.label}
                    {dt.required ? (
                      <span className="ml-1.5 text-[10px] font-bold text-destructive">REQUIRED</span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {existing.length} uploaded
                  </p>
                </div>
                <label
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs font-semibold ${
                    disabled || uploading === dt.value ? "pointer-events-none opacity-50" : "hover:bg-accent"
                  }`}
                >
                  {uploading === dt.value ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Upload
                  <input
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUpload(dt.value, f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {existing.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {existing.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs"
                    >
                      <a
                        href={d.signed_url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-primary hover:underline"
                      >
                        View document
                      </a>
                      <span className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {d.status}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => void handleDelete(d.id)}
                          disabled={disabled}
                          aria-label="Delete"
                          className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
