import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { VendorShell } from "@/components/vendor-shell";
import { useAuth } from "@/auth/AuthProvider";
import {
  getPlatformSettings,
  updatePlatformSetting,
  addPlatformSetting,
  getPlatformAudit,
  exportPlatformAuditCsv,
  revealPlatformSetting,
  type PlatformSetting,
  type PlatformSettingAuditEntry,
} from "@/lib/platform-settings.functions";
import { testPlatformService } from "@/lib/platform-tests.functions";
import { getPaystackWebhookStatus } from "@/lib/webhooks.functions";
import { validateKey, KEY_TO_TEST_SERVICE } from "@/lib/key-formats";
import { LiveChatWidget } from "@/components/live-chat-widget";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Eye,
  EyeOff,
  Save,
  Plus,
  Shield,
  CreditCard,
  BarChart3,
  Mail,
  Settings,
  CheckCircle2,
  AlertCircle,
  History,
  Lock,
  Download,
  PlayCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/vendor/settings")({
  component: VendorSettingsPage,
  head: () => ({ meta: [{ title: "Settings — ecove Vendor" }] }),
});

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  monitoring: { label: "Monitoring & Error Tracking", icon: <Shield className="h-5 w-5" />, description: "Configure error tracking and monitoring services" },
  payments: { label: "Payment Gateways", icon: <CreditCard className="h-5 w-5" />, description: "API keys for payment processing providers" },
  storage: { label: "Storage & Media (Cloudinary)", icon: <Settings className="h-5 w-5" />, description: "Cloudinary credentials for signed product image uploads" },
  analytics: { label: "Analytics", icon: <BarChart3 className="h-5 w-5" />, description: "Analytics and tracking service configuration" },
  email: { label: "Email & Notifications", icon: <Mail className="h-5 w-5" />, description: "SMTP and Resend keys for transactional email" },
  livechat: { label: "Live Chat Widget", icon: <MessageCircle className="h-5 w-5" />, description: "Configure Tawk.to, Crisp, or Intercom live chat on the storefront" },
  general: { label: "General", icon: <Settings className="h-5 w-5" />, description: "Other platform configuration" },
};

function VendorSettingsPage() {
  const { hasRole, loading: authLoading, user } = useAuth();
  const isAdmin = hasRole("admin");

  if (authLoading) {
    return (
      <VendorShell title="Platform Settings" subtitle="Manage API keys and integrations">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </VendorShell>
    );
  }

  if (!user || !isAdmin) {
    return (
      <VendorShell title="Platform Settings" subtitle="Manage API keys and integrations">
        <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
          <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold">Admins only</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform API keys can only be viewed and changed by admin users.
          </p>
          {!user && (
            <Link to="/login" className="mt-4 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          )}
        </div>
      </VendorShell>
    );
  }

  return <AdminSettingsView />;
}

function AdminSettingsView() {
  const fetchSettings = useServerFn(getPlatformSettings);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: () => fetchSettings(),
  });

  const settings = data?.settings ?? [];

  const grouped = settings.reduce<Record<string, PlatformSetting[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  const categoryOrder = ["payments", "storage", "email", "livechat", "monitoring", "analytics", "general"];
  const sortedCategories = Object.keys(grouped).sort(
    (a, b) => (categoryOrder.indexOf(a) === -1 ? 99 : categoryOrder.indexOf(a)) - (categoryOrder.indexOf(b) === -1 ? 99 : categoryOrder.indexOf(b)),
  );

  const allKeys = settings.map((s) => s.key);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
    queryClient.invalidateQueries({ queryKey: ["platform-settings-audit"] });
  };

  return (
    <VendorShell title="Platform Settings" subtitle="Manage API keys and integrations">
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
          <p className="mt-2 text-sm font-medium text-destructive">
            Failed to load settings. Make sure you have admin access and the platform_settings table exists.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{(error as Error).message}</p>
        </div>
      )}

      {!isLoading && !error && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {settings.length} key{settings.length !== 1 ? "s" : ""} configured
            </p>
            <AddKeyDialog onAdded={refresh} />
          </div>

          {sortedCategories.map((cat) => (
            <CategoryCard
              key={cat}
              category={cat}
              settings={grouped[cat]!}
              onUpdated={refresh}
            />
          ))}

          <AuditLogCard allKeys={allKeys} />
        </div>
      )}
    </VendorShell>
  );
}

type TestService =
  | "sentry"
  | "paystack"
  | "paystack_webhook"
  | "stripe"
  | "smtp"
  | "cloudinary"
  | "resend";

function CategoryTestButtons({ category }: { category: string }) {
  const services: Array<{ id: TestService; label: string }> = [];
  if (category === "monitoring") services.push({ id: "sentry", label: "Test Sentry" });
  if (category === "payments") {
    services.push({ id: "paystack", label: "Test Paystack" });
    services.push({ id: "paystack_webhook", label: "Test Webhook" });
    services.push({ id: "stripe", label: "Test Stripe" });
  }
  if (category === "email") {
    services.push({ id: "smtp", label: "Test SMTP" });
    services.push({ id: "resend", label: "Test Resend" });
  }
  if (category === "storage") services.push({ id: "cloudinary", label: "Test Cloudinary" });
  if (services.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {services.map((s) => (
        <TestServiceButton key={s.id} service={s.id} label={s.label} />
      ))}
    </div>
  );
}

function TestServiceButton({
  service,
  label,
}: {
  service: "sentry" | "paystack" | "stripe" | "smtp" | "cloudinary" | "resend";
  label: string;
}) {
  const testFn = useServerFn(testPlatformService);
  const mutation = useMutation({
    mutationFn: () => testFn({ data: { service } }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message, { description: result.detail });
      } else {
        toast.error(result.message, { description: result.detail });
      }
    },
    onError: (err) => toast.error(`Test failed: ${(err as Error).message}`),
  });
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1 text-xs"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
      {label}
    </Button>
  );
}

function AuditLogCard({ allKeys }: { allKeys: string[] }) {
  const fetchAudit = useServerFn(getPlatformAudit);
  const exportFn = useServerFn(exportPlatformAuditCsv);

  const [keyFilter, setKeyFilter] = useState<string>("__all");
  const [actionFilter, setActionFilter] = useState<string>("__all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filters = {
    key: keyFilter === "__all" ? undefined : keyFilter,
    action: actionFilter === "__all" ? undefined : (actionFilter as "insert" | "update" | "delete"),
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to).toISOString() : undefined,
  };

  const { data, isFetching } = useQuery({
    queryKey: ["platform-settings-audit", { ...filters, page, pageSize }],
    queryFn: () => fetchAudit({ data: { ...filters, page, pageSize } }),
  });

  const entries: PlatformSettingAuditEntry[] = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleExport = async () => {
    try {
      const res = await exportFn({ data: filters });
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `platform-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${res.count} audit entries`);
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <History className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Audit Log</CardTitle>
              <CardDescription className="text-xs">
                Changes to platform settings (secret values are never recorded)
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-[11px]">Key</Label>
            <Select value={keyFilter} onValueChange={(v) => { setKeyFilter(v); setPage(1); }}>
              <SelectTrigger className="mt-1 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All keys</SelectItem>
                {allKeys.map((k) => (
                  <SelectItem key={k} value={k} className="font-mono text-xs">
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px]">Action</Label>
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
              <SelectTrigger className="mt-1 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All actions</SelectItem>
                <SelectItem value="insert">Insert</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px]">From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1); }}
              className="mt-1 h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[11px]">To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1); }}
              className="mt-1 h-8 text-xs"
            />
          </div>
        </div>

        {isFetching && (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}

        {!isFetching && entries.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">No matching changes.</p>
        )}

        {entries.length > 0 && (
          <ul className="divide-y divide-border">
            {entries.map((e) => (
              <li key={e.id} className="py-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase">{e.action}</Badge>
                    <span className="font-mono font-semibold">{e.key}</span>
                    {e.is_secret && <Badge variant="outline" className="text-[10px]">Secret</Badge>}
                  </div>
                  <span className="text-muted-foreground">
                    {new Date(e.changed_at).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  Changed: {e.changed_fields.join(", ") || "—"}
                  {" · "}
                  by: <span className="font-mono">{e.changed_by ? e.changed_by.slice(0, 8) : "system"}</span>
                </div>
                {!e.is_secret && (e.old_value || e.new_value) && e.changed_fields.includes("value") && (
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground/80">
                    <span className="line-through">{e.old_value || "∅"}</span>
                    {" → "}
                    <span className="text-foreground">{e.new_value || "∅"}</span>
                  </div>
                )}
                {e.is_secret && e.changed_fields.includes("value") && (
                  <div className="mt-1 text-[11px] text-muted-foreground/80">
                    Secret value changed ({e.old_value_length ?? 0} → {e.new_value_length ?? 0} chars)
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-border pt-2">
          <p className="text-[11px] text-muted-foreground">
            Page {page} of {totalPages} · {total} total
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryCard({
  category,
  settings,
  onUpdated,
}: {
  category: string;
  settings: PlatformSetting[];
  onUpdated: () => void;
}) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.general!;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {meta.icon}
            </div>
            <div>
              <CardTitle className="text-base">{meta.label}</CardTitle>
              <CardDescription className="text-xs">{meta.description}</CardDescription>
            </div>
          </div>
          <CategoryTestButtons category={category} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings.map((s) => (
          <SettingRow key={s.id} setting={s} onUpdated={onUpdated} />
        ))}
      </CardContent>
    </Card>
  );
}

function SettingRow({ setting, onUpdated }: { setting: PlatformSetting; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState(false);
  const updateFn = useServerFn(updatePlatformSetting);

  const mutation = useMutation({
    mutationFn: (newValue: string) => updateFn({ data: { id: setting.id, value: newValue } }),
    onSuccess: () => {
      toast.success(`${setting.label} updated`);
      setEditing(false);
      onUpdated();
    },
    onError: (err) => toast.error(`Failed: ${(err as Error).message}`),
  });

  const startEditing = useCallback(() => {
    setValue(setting.is_secret ? "" : setting.value);
    setEditing(true);
  }, [setting]);

  const hasValue = setting.value && setting.value !== "••••••••";
  const displayValue = setting.is_secret
    ? revealed && setting.value
      ? setting.value
      : "••••••••"
    : setting.value || "—";

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-foreground">{setting.key}</span>
            {setting.is_secret && (
              <Badge variant="outline" className="text-[10px]">
                Secret
              </Badge>
            )}
            {hasValue ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 text-muted-foreground/50" />
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{setting.description}</p>
        </div>

        {!editing && (
          <div className="flex items-center gap-2">
            {setting.is_secret && setting.value && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setRevealed((r) => !r)}
              >
                {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={startEditing}>
              {hasValue ? "Update" : "Set value"}
            </Button>
          </div>
        )}
      </div>

      {!editing && (
        <div className="mt-2 truncate rounded bg-muted/50 px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
          {displayValue}
        </div>
      )}

      {editing && (
        <div className="mt-3 flex items-center gap-2">
          <Input
            type={setting.is_secret ? "password" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`Enter ${setting.label}`}
            className="h-8 font-mono text-xs"
            autoFocus
          />
          <Button
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => mutation.mutate(value)}
            disabled={mutation.isPending}
          >
            <Save className="h-3 w-3" />
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
      )}

      {setting.updated_at && (
        <p className="mt-1.5 text-[10px] text-muted-foreground/50">
          Last updated: {new Date(setting.updated_at).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

function AddKeyDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [isSecret, setIsSecret] = useState(false);
  const addFn = useServerFn(addPlatformSetting);

  const mutation = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          key: key.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
          label,
          description: description || undefined,
          category,
          is_secret: isSecret,
        },
      }),
    onSuccess: () => {
      toast.success("Key added");
      setOpen(false);
      setKey("");
      setLabel("");
      setDescription("");
      setCategory("general");
      setIsSecret(false);
      onAdded();
    },
    onError: (err) => toast.error(`Failed: ${(err as Error).message}`),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add Key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add API Key</DialogTitle>
          <DialogDescription>
            Add a new configuration key to the platform settings.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">Key Name</Label>
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. TWILIO_API_KEY"
              className="mt-1 font-mono text-sm uppercase"
            />
          </div>
          <div>
            <Label className="text-xs">Display Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Twilio API Key"
              className="mt-1 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description of what this key is for"
              className="mt-1 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="payments">Payments</SelectItem>
                <SelectItem value="monitoring">Monitoring</SelectItem>
                <SelectItem value="analytics">Analytics</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isSecret} onCheckedChange={setIsSecret} />
            <Label className="text-xs">This is a secret value (will be masked in UI)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !key || !label}>
            Add Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
