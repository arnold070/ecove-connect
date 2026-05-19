import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  CheckCircle2, XCircle, Loader2, Circle, AlertCircle, RotateCw,
  Download, Copy, FileSpreadsheet, ChevronDown, ChevronRight, Filter, Shield,
  ChevronsUpDown, Clipboard,
} from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { VendorShell } from "@/components/vendor-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/slug";

export const Route = createFileRoute("/admin/diagnostics")({
  component: VendorDiagnosticsPage,
});

type StepStatus = "pending" | "running" | "ok" | "fail";
type StepId =
  | "auth"
  | "vendor-lookup"
  | "vendor-upsert"
  | "vendor-role"
  | "product-insert"
  | "product-readback";

interface HttpExchange {
  url: string;
  method: string;
  status: number;
  statusText: string;
  durationMs: number;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
}

interface Step {
  id: StepId;
  label: string;
  status: StepStatus;
  detail?: string;
  exchanges?: HttpExchange[];
}

const STEP_LABELS: Record<StepId, string> = {
  auth: "Verify signed-in user",
  "vendor-lookup": "Look up existing vendor row",
  "vendor-upsert": "Create or reuse vendor row",
  "vendor-role": "Ensure 'vendor' role in user_roles",
  "product-insert": "Insert test product as 'pending'",
  "product-readback": "Read it back from /vendor/products/pending query",
};

const STEP_ORDER: StepId[] = [
  "auth",
  "vendor-lookup",
  "vendor-upsert",
  "vendor-role",
  "product-insert",
  "product-readback",
];

const initialSteps = (): Step[] =>
  STEP_ORDER.map((id) => ({ id, label: STEP_LABELS[id], status: "pending" }));

function fmtErr(e: unknown): string {
  const x = e as { message?: string; code?: string; details?: string; hint?: string };
  return (
    [x?.message, x?.code && `code: ${x.code}`, x?.details && `details: ${x.details}`, x?.hint && `hint: ${x.hint}`]
      .filter(Boolean)
      .join(" — ") || String(e)
  );
}

interface Ctx {
  userId: string;
  storeName: string;
  productTitle: string;
  vendorId: string | null;
  productId: string | null;
}

function VendorDiagnosticsPage() {
  const { user, loading: authLoading } = useAuth();
  const [steps, setSteps] = useState<Step[]>(initialSteps());
  const [running, setRunning] = useState<StepId | "all" | null>(null);
  const [storeName, setStoreName] = useState("Diagnostic Store");
  const [productTitle, setProductTitle] = useState("Diagnostic Product");
  const ctxRef = useRef<Pick<Ctx, "vendorId" | "productId">>({ vendorId: null, productId: null });

  // Inspector / privacy controls
  const [showOnlyFailed, setShowOnlyFailed] = useState(false);
  const [expanded, setExpanded] = useState<Set<StepId>>(new Set());
  const DEFAULT_REDACT_KEYS = "password, authorization, email, apikey, token, cookie, set-cookie, secret";
  const [redactKeysInput, setRedactKeysInput] = useState(DEFAULT_REDACT_KEYS);
  // Per-step truncation overrides
  const [stepTruncOverrides, setStepTruncOverrides] = useState<Record<StepId, number>>({} as Record<StepId, number>);
  const [truncationLimit, setTruncationLimit] = useState(8000);

  const redactKeyList = redactKeysInput
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  const shouldRedactKey = (key: string) => {
    const k = key.toLowerCase();
    return redactKeyList.some((needle) => k.includes(needle));
  };

  // Redact a JSON-ish body string by parsing and walking; falls back to regex for non-JSON.
  const redactBody = (body: string | null): string | null => {
    if (!body) return body;
    try {
      const parsed = JSON.parse(body);
      const walk = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(walk);
        if (v && typeof v === "object") {
          const out: Record<string, unknown> = {};
          for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
            out[k] = shouldRedactKey(k) ? "[redacted]" : walk(val);
          }
          return out;
        }
        return v;
      };
      return JSON.stringify(walk(parsed), null, 2);
    } catch {
      // Non-JSON: redact "key=value" / "key":"value" forms for each configured key.
      let out = body;
      for (const k of redactKeyList) {
        const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        out = out.replace(new RegExp(`("${esc}"\\s*:\\s*)"[^"]*"`, "gi"), `$1"[redacted]"`);
        out = out.replace(new RegExp(`(${esc}=)[^&\\s]+`, "gi"), `$1[redacted]`);
      }
      return out;
    }
  };

  const redactHeaders = (h: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(h)) out[k] = shouldRedactKey(k) ? "[redacted]" : v;
    return out;
  };

  const truncate = (s: string | null, limit = truncationLimit): string | null => {
    if (s == null) return s;
    return s.length > limit ? s.slice(0, limit) + `…[truncated ${s.length - limit} chars]` : s;
  };

  const sanitizeExchange = (x: HttpExchange, limitOverride?: number): HttpExchange => {
    const limit = limitOverride ?? truncationLimit;
    return {
      ...x,
      requestHeaders: redactHeaders(x.requestHeaders),
      responseHeaders: redactHeaders(x.responseHeaders),
      requestBody: truncate(redactBody(x.requestBody), limit),
      responseBody: truncate(redactBody(x.responseBody), limit),
    };
  };

  const toggleExpanded = (id: StepId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAllVisible = () => {
    const visibleIds = steps
      .filter((s) => (showOnlyFailed ? s.status === "fail" : true))
      .filter((s) => (s.exchanges ?? []).length > 0)
      .map((s) => s.id);
    setExpanded((prev) => {
      const allOpen = visibleIds.every((id) => prev.has(id));
      if (allOpen) return new Set(); // collapse all
      return new Set([...prev, ...visibleIds]);
    });
  };

  const copyCallDetails = async (raw: HttpExchange, stepId: StepId) => {
    const limit = stepTruncOverrides[stepId] ?? truncationLimit;
    const x = sanitizeExchange(raw, limit);
    const lines = [
      `${x.method} ${x.url} → ${x.status} ${x.statusText} (${x.durationMs}ms)`,
      "",
      "--- Request Headers ---",
      JSON.stringify(x.requestHeaders, null, 2),
    ];
    if (x.requestBody) lines.push("", "--- Request Body ---", x.requestBody);
    lines.push("", "--- Response Headers ---", JSON.stringify(x.responseHeaders, null, 2));
    if (x.responseBody) lines.push("", "--- Response Body ---", x.responseBody);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Call details copied");
    } catch {
      toast.error("Could not access clipboard");
    }
  };

  const update = (id: StepId, patch: Partial<Step>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const reset = () => {
    setSteps(initialSteps());
    ctxRef.current = { vendorId: null, productId: null };
  };

  const headersToObject = (h: HeadersInit | undefined): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!h) return out;
    if (h instanceof Headers) h.forEach((v, k) => (out[k] = v));
    else if (Array.isArray(h)) for (const [k, v] of h) out[k] = v;
    else for (const [k, v] of Object.entries(h)) out[k] = String(v);
    return out;
  };

  const responseHeadersToObject = (h: Headers): Record<string, string> => {
    const out: Record<string, string> = {};
    h.forEach((v, k) => (out[k] = v));
    return out;
  };

  // Wrap window.fetch during a step so we can capture HTTP exchanges.
  const withCapture = async <T,>(stepId: StepId, fn: () => PromiseLike<T>): Promise<T> => {
    const exchanges: HttpExchange[] = [];
    const original = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const start = performance.now();
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      let requestBody: string | null = null;
      if (init?.body && typeof init.body === "string") requestBody = init.body;
      else if (init?.body) requestBody = "[non-string body]";
      const requestHeaders = headersToObject(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      try {
        const res = await original(input as RequestInfo, init);
        let responseBody: string | null = null;
        try {
          responseBody = await res.clone().text();
        } catch {
          responseBody = "[unreadable body]";
        }
        exchanges.push({
          url, method, status: res.status, statusText: res.statusText,
          durationMs: Math.round(performance.now() - start),
          requestHeaders, requestBody,
          responseHeaders: responseHeadersToObject(res.headers),
          responseBody,
        });
        return res;
      } catch (err) {
        exchanges.push({
          url, method, status: 0,
          statusText: err instanceof Error ? err.message : "fetch failed",
          durationMs: Math.round(performance.now() - start),
          requestHeaders, requestBody,
          responseHeaders: {}, responseBody: null,
        });
        throw err;
      }
    }) as typeof window.fetch;
    try {
      const result = await fn();
      update(stepId, { exchanges });
      return result;
    } catch (e) {
      update(stepId, { exchanges });
      throw e;
    } finally {
      window.fetch = original;
    }
  };

  // Each runner returns true on success, false on failure (and updates step state).
  const runners: Record<StepId, (ctx: Ctx) => Promise<boolean>> = {
    auth: async (ctx) => {
      update("auth", { status: "running" });
      if (!ctx.userId) {
        update("auth", { status: "fail", detail: "No signed-in user" });
        return false;
      }
      update("auth", { status: "ok", detail: `user.id = ${ctx.userId}` });
      return true;
    },
    "vendor-lookup": async (ctx) => {
      update("vendor-lookup", { status: "running", exchanges: [] });
      try {
        const { data, error } = await withCapture("vendor-lookup", () =>
          supabase
            .from("vendors")
            .select("id, slug, store_name")
            .eq("owner_id", ctx.userId)
            .maybeSingle(),
        );
        if (error) throw error;
        if (data) {
          ctxRef.current.vendorId = data.id;
          update("vendor-lookup", { status: "ok", detail: `Found vendor ${data.slug}` });
        } else {
          ctxRef.current.vendorId = null;
          update("vendor-lookup", { status: "ok", detail: "No vendor row yet" });
        }
        return true;
      } catch (e) {
        update("vendor-lookup", { status: "fail", detail: fmtErr(e) });
        return false;
      }
    },
    "vendor-upsert": async (ctx) => {
      update("vendor-upsert", { status: "running", exchanges: [] });
      if (ctxRef.current.vendorId) {
        update("vendor-upsert", { status: "ok", detail: "Reused existing vendor" });
        return true;
      }
      try {
        const slug = `${slugify(ctx.storeName)}-${ctx.userId.slice(0, 6)}`;
        const { data, error } = await withCapture("vendor-upsert", () =>
          supabase
            .from("vendors")
            .insert({ owner_id: ctx.userId, store_name: ctx.storeName, slug })
            .select("id")
            .single(),
        );
        if (error) throw error;
        ctxRef.current.vendorId = data.id;
        update("vendor-upsert", { status: "ok", detail: `Created vendor ${data.id}` });
        return true;
      } catch (e) {
        update("vendor-upsert", { status: "fail", detail: fmtErr(e) });
        return false;
      }
    },
    "vendor-role": async (ctx) => {
      update("vendor-role", { status: "running", exchanges: [] });
      try {
        const { error } = await withCapture("vendor-role", () =>
          supabase.from("user_roles").insert({ user_id: ctx.userId, role: "vendor" }),
        );
        if (error && !/duplicate|unique/i.test(error.message)) throw error;
        update("vendor-role", {
          status: "ok",
          detail: error ? "Already had role" : "Inserted vendor role",
        });
        return true;
      } catch (e) {
        update("vendor-role", { status: "fail", detail: fmtErr(e) });
        return false;
      }
    },
    "product-insert": async (ctx) => {
      update("product-insert", { status: "running", exchanges: [] });
      const vendorId = ctxRef.current.vendorId;
      if (!vendorId) {
        update("product-insert", {
          status: "fail",
          detail: "No vendorId in context — run 'vendor-lookup' / 'vendor-upsert' first",
        });
        return false;
      }
      try {
        const stamp = Date.now();
        const title = `${ctx.productTitle} ${stamp}`;
        const slug = `${slugify(title)}-${ctx.userId.slice(0, 6)}`;
        const { data, error } = await withCapture("product-insert", () =>
          supabase
            .from("products")
            .insert({
              vendor_id: vendorId,
              title,
              slug,
              description: "Auto-generated by diagnostics",
              price_kobo: 999900,
              stock: 1,
              status: "pending",
            })
            .select("id, status, slug, price_kobo")
            .single(),
        );
        if (error) throw error;
        ctxRef.current.productId = data.id;
        update("product-insert", {
          status: "ok",
          detail: `Inserted product ${data.id} (status=${data.status}, slug=${data.slug}, price_kobo=${data.price_kobo})`,
        });
        return true;
      } catch (e) {
        update("product-insert", { status: "fail", detail: fmtErr(e) });
        return false;
      }
    },
    "product-readback": async () => {
      update("product-readback", { status: "running", exchanges: [] });
      const vendorId = ctxRef.current.vendorId;
      const productId = ctxRef.current.productId;
      if (!vendorId || !productId) {
        update("product-readback", {
          status: "fail",
          detail: "Missing vendorId or productId — run earlier steps first",
        });
        return false;
      }
      try {
        const { data, error } = await withCapture("product-readback", () =>
          supabase
            .from("products")
            .select("id")
            .eq("vendor_id", vendorId)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(50),
        );
        if (error) throw error;
        const found = (data ?? []).some((p: { id: string }) => p.id === productId);
        if (!found) throw new Error("Product not found in pending list (RLS hides it from vendor?)");
        update("product-readback", {
          status: "ok",
          detail: `Pending list returned ${data?.length ?? 0} rows including the new one`,
        });
        return true;
      } catch (e) {
        update("product-readback", { status: "fail", detail: fmtErr(e) });
        return false;
      }
    },
  };

  const buildCtx = (): Ctx | null => {
    if (!user) return null;
    return {
      userId: user.id,
      storeName,
      productTitle,
      vendorId: ctxRef.current.vendorId,
      productId: ctxRef.current.productId,
    };
  };

  const runAll = async () => {
    const ctx = buildCtx();
    if (!ctx) return;
    reset();
    setRunning("all");
    for (const id of STEP_ORDER) {
      const ok = await runners[id]({ ...ctx, vendorId: ctxRef.current.vendorId, productId: ctxRef.current.productId });
      if (!ok) break;
    }
    setRunning(null);
  };

  const runOne = async (id: StepId) => {
    const ctx = buildCtx();
    if (!ctx) return;
    setRunning(id);
    await runners[id]({ ...ctx, vendorId: ctxRef.current.vendorId, productId: ctxRef.current.productId });
    setRunning(null);
  };

  const productCreated = !!ctxRef.current.productId;

  const exportLog = () => {
    const userRedacted = user
      ? { id: user.id, email: shouldRedactKey("email") ? "[redacted]" : user.email }
      : null;
    const log = {
      exportedAt: new Date().toISOString(),
      redaction: { keys: redactKeyList, truncationLimit },
      user: userRedacted,
      inputs: { storeName, productTitle },
      context: {
        vendorId: ctxRef.current.vendorId,
        productId: ctxRef.current.productId,
      },
      steps: steps.map((s) => ({
        id: s.id,
        label: s.label,
        status: s.status,
        detail: s.detail ?? null,
        // Full sanitized exchanges for failed steps; compact metadata for ok steps.
        exchanges:
          s.status === "fail"
            ? (s.exchanges ?? []).map(sanitizeExchange)
            : (s.exchanges ?? []).map((x) => ({
                url: x.url,
                method: x.method,
                status: x.status,
                statusText: x.statusText,
                durationMs: x.durationMs,
              })),
      })),
      summary: {
        total: steps.length,
        ok: steps.filter((s) => s.status === "ok").length,
        failed: steps.filter((s) => s.status === "fail").length,
        pending: steps.filter((s) => s.status === "pending").length,
      },
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    };
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
    triggerDownload(blob, `vendor-diagnostics-${stamp()}.json`);
  };

  const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [
      ["#", "id", "label", "status", "detail", "http_calls", "last_status_code"],
      ...steps.map((s, i) => {
        const ex = s.exchanges ?? [];
        const last = ex[ex.length - 1];
        return [
          i + 1,
          s.id,
          s.label,
          s.status,
          s.detail ?? "",
          ex.length,
          last ? `${last.status} ${last.statusText}` : "",
        ];
      }),
    ];
    const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
    triggerDownload(new Blob([csv], { type: "text/csv" }), `vendor-diagnostics-${stamp()}.csv`);
  };

  const copySummary = async () => {
    const lines: string[] = [];
    lines.push(`Vendor diagnostics — ${new Date().toLocaleString()}`);
    if (user) {
      const who = shouldRedactKey("email") ? user.id : (user.email ?? user.id);
      lines.push(`User: ${who}`);
    }
    lines.push(`Vendor: ${ctxRef.current.vendorId ?? "—"}  Product: ${ctxRef.current.productId ?? "—"}`);
    lines.push(`Redacted keys: ${redactKeyList.join(", ") || "(none)"}`);
    lines.push("");
    steps.forEach((s, i) => {
      const icon = s.status === "ok" ? "✅" : s.status === "fail" ? "❌" : s.status === "running" ? "⏳" : "⏸";
      lines.push(`${icon} ${i + 1}. ${s.label} — ${s.status}`);
      if (s.detail) lines.push(`    ${s.detail}`);
      if (s.status === "fail") {
        for (const x of s.exchanges ?? []) {
          lines.push(`    HTTP ${x.method} ${x.url} → ${x.status} ${x.statusText} (${x.durationMs}ms)`);
        }
      }
    });
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Diagnostics summary copied to clipboard");
    } catch {
      toast.error("Could not access clipboard");
    }
  };

  const hasResults = steps.some((s) => s.status !== "pending");

  return (
    <VendorShell
      title="End-to-end diagnostics"
      subtitle="Run the vendor onboarding + product creation flow and see exactly where it breaks"
    >
      <div className="space-y-6 max-w-3xl">
        {!authLoading && !user && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Not signed in</AlertTitle>
            <AlertDescription>
              You need to <Link to="/login" className="underline">log in</Link> before running the diagnostics.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Test inputs</CardTitle>
            <CardDescription>Used only if a vendor row needs to be created</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="store_name">Store name</Label>
              <Input id="store_name" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product_title">Product title</Label>
              <Input id="product_title" value={productTitle} onChange={(e) => setProductTitle(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={runAll} disabled={!!running || !user}>
                {running === "all" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Run diagnostics
              </Button>
              <Button variant="outline" onClick={reset} disabled={!!running}>
                Reset
              </Button>
              <Button variant="outline" onClick={exportLog} disabled={!hasResults}>
                <Download className="mr-2 h-4 w-4" />
                Export log (JSON)
              </Button>
              <Button variant="outline" onClick={exportCsv} disabled={!hasResults}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button variant="outline" onClick={copySummary} disabled={!hasResults}>
                <Copy className="mr-2 h-4 w-4" />
                Copy summary
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" /> Privacy & redaction
            </CardTitle>
            <CardDescription>
              Comma-separated keys (case-insensitive substring match) to redact from headers, JSON bodies,
              and clipboard/exported logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="redact_keys">Redacted keys</Label>
              <Input
                id="redact_keys"
                value={redactKeysInput}
                onChange={(e) => setRedactKeysInput(e.target.value)}
                placeholder={DEFAULT_REDACT_KEYS}
              />
              <p className="text-xs text-muted-foreground">
                Active: {redactKeyList.join(", ") || "(none)"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trunc_limit">Body truncation limit (characters)</Label>
              <Input
                id="trunc_limit"
                type="number"
                min={500}
                max={200000}
                step={500}
                value={truncationLimit}
                onChange={(e) => setTruncationLimit(Math.max(500, Number(e.target.value) || 8000))}
                className="max-w-[200px]"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Steps</CardTitle>
                <CardDescription>Retry only the failing step without restarting the whole flow</CardDescription>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={expandAllVisible}
                  disabled={!hasResults}
                  className="h-7 px-2 text-xs"
                >
                  <ChevronsUpDown className="mr-1 h-3 w-3" />
                  {(() => {
                    const visibleWithExchanges = steps
                      .filter((s) => (showOnlyFailed ? s.status === "fail" : true))
                      .filter((s) => (s.exchanges ?? []).length > 0);
                    const allOpen = visibleWithExchanges.length > 0 && visibleWithExchanges.every((s) => expanded.has(s.id));
                    return allOpen ? "Collapse all" : "Expand all";
                  })()}
                </Button>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="only_failed" className="text-sm font-normal">
                    Only failed
                  </Label>
                  <Switch
                    id="only_failed"
                    checked={showOnlyFailed}
                    onCheckedChange={setShowOnlyFailed}
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {steps
                .map((s, i) => ({ s, i }))
                .filter(({ s }) => (showOnlyFailed ? s.status === "fail" : true))
                .map(({ s, i }) => {
                  const isRunningThis = running === s.id;
                  const exchanges = s.exchanges ?? [];
                  const hasDetails = exchanges.length > 0;
                  const isOpen = expanded.has(s.id);
                  return (
                    <li key={s.id} className="flex gap-3 items-start">
                      <div className="pt-0.5">
                        {s.status === "ok" && <CheckCircle2 className="h-5 w-5 text-primary" />}
                        {s.status === "fail" && <XCircle className="h-5 w-5 text-destructive" />}
                        {(s.status === "running" || isRunningThis) && (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        )}
                        {s.status === "pending" && !isRunningThis && (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium text-sm">
                            {i + 1}. {s.label}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            {hasDetails && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleExpanded(s.id)}
                                className="h-7 px-2 text-xs"
                              >
                                {isOpen ? (
                                  <ChevronDown className="mr-1 h-3 w-3" />
                                ) : (
                                  <ChevronRight className="mr-1 h-3 w-3" />
                                )}
                                {exchanges.length} HTTP {exchanges.length === 1 ? "call" : "calls"}
                              </Button>
                            )}
                            {s.status === "fail" && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void runOne(s.id)}
                                disabled={!!running || !user}
                                className="h-7 px-2 text-xs"
                              >
                                <RotateCw className="mr-1 h-3 w-3" />
                                Retry
                              </Button>
                            )}
                          </div>
                        </div>
                        {s.detail && (
                          <p
                            className={
                              "text-xs mt-1 break-words " +
                              (s.status === "fail" ? "text-destructive" : "text-muted-foreground")
                            }
                          >
                            {s.detail}
                          </p>
                        )}
                        {hasDetails && (
                          <Collapsible open={isOpen} onOpenChange={() => toggleExpanded(s.id)}>
                            <CollapsibleTrigger className="sr-only">toggle</CollapsibleTrigger>
                            <CollapsibleContent className="mt-2 space-y-3">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Label className="text-xs font-normal">Truncation:</Label>
                                <Input
                                  type="number"
                                  min={500}
                                  step={2000}
                                  value={stepTruncOverrides[s.id] ?? truncationLimit}
                                  onChange={(e) => {
                                    const v = Math.max(500, Number(e.target.value) || truncationLimit);
                                    setStepTruncOverrides((prev) => ({ ...prev, [s.id]: v }));
                                  }}
                                  className="h-6 w-24 text-xs"
                                />
                                <span>chars</span>
                                {stepTruncOverrides[s.id] != null && stepTruncOverrides[s.id] !== truncationLimit && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1 text-[10px]"
                                    onClick={() => setStepTruncOverrides((prev) => {
                                      const next = { ...prev };
                                      delete next[s.id];
                                      return next;
                                    })}
                                  >
                                    Reset
                                  </Button>
                                )}
                              </div>
                              {exchanges.map((raw, idx) => {
                                const stepLimit = stepTruncOverrides[s.id] ?? truncationLimit;
                                const x = sanitizeExchange(raw, stepLimit);
                                const codeClass =
                                  x.status >= 400 || x.status === 0
                                    ? "text-destructive"
                                    : "text-muted-foreground";
                                return (
                                  <div
                                    key={idx}
                                    className="rounded-md border bg-muted/30 p-3 text-xs space-y-2 overflow-hidden"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex flex-wrap items-center gap-2 font-mono">
                                        <span className="font-semibold">{x.method}</span>
                                        <span className="break-all">{x.url}</span>
                                        <span className={codeClass}>
                                          → {x.status} {x.statusText} ({x.durationMs}ms)
                                        </span>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-[10px] shrink-0"
                                        onClick={() => void copyCallDetails(raw, s.id)}
                                      >
                                        <Clipboard className="mr-1 h-3 w-3" />
                                        Copy call
                                      </Button>
                                    </div>
                                    <details>
                                      <summary className="cursor-pointer text-muted-foreground">
                                        Request headers
                                      </summary>
                                      <pre className="mt-1 whitespace-pre-wrap break-all bg-background rounded p-2 text-[11px]">
                                        {JSON.stringify(x.requestHeaders, null, 2)}
                                      </pre>
                                    </details>
                                    {x.requestBody && (
                                      <details>
                                        <summary className="cursor-pointer text-muted-foreground">
                                          Request body
                                        </summary>
                                        <pre className="mt-1 whitespace-pre-wrap break-all bg-background rounded p-2 text-[11px]">
                                          {x.requestBody}
                                        </pre>
                                      </details>
                                    )}
                                    <details open={x.status >= 400}>
                                      <summary className="cursor-pointer text-muted-foreground">
                                        Response headers
                                      </summary>
                                      <pre className="mt-1 whitespace-pre-wrap break-all bg-background rounded p-2 text-[11px]">
                                        {JSON.stringify(x.responseHeaders, null, 2)}
                                      </pre>
                                    </details>
                                    {x.responseBody && (
                                      <details open={x.status >= 400}>
                                        <summary className="cursor-pointer text-muted-foreground">
                                          Response body
                                        </summary>
                                        <pre className="mt-1 whitespace-pre-wrap break-all bg-background rounded p-2 text-[11px]">
                                          {x.responseBody}
                                        </pre>
                                      </details>
                                    )}
                                  </div>
                                );
                              })}
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </div>
                    </li>
                  );
                })}
              {showOnlyFailed && !steps.some((s) => s.status === "fail") && (
                <li className="text-sm text-muted-foreground">No failed steps to show.</li>
              )}
            </ol>
          </CardContent>
        </Card>

        {productCreated && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Product created</AlertTitle>
            <AlertDescription>
              Open <Link to="/vendor/products/pending" className="underline">/vendor/products/pending</Link> to
              confirm it appears in the UI.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </VendorShell>
  );
}
