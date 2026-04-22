import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { CheckCircle2, XCircle, Loader2, Circle, AlertCircle, RotateCw, Download } from "lucide-react";

import { VendorShell } from "@/components/vendor-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/slug";

export const Route = createFileRoute("/vendor/diagnostics")({
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

interface Step {
  id: StepId;
  label: string;
  status: StepStatus;
  detail?: string;
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

  const update = (id: StepId, patch: Partial<Step>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const reset = () => {
    setSteps(initialSteps());
    ctxRef.current = { vendorId: null, productId: null };
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
      update("vendor-lookup", { status: "running" });
      try {
        const { data, error } = await supabase
          .from("vendors")
          .select("id, slug, store_name")
          .eq("owner_id", ctx.userId)
          .maybeSingle();
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
      update("vendor-upsert", { status: "running" });
      if (ctxRef.current.vendorId) {
        update("vendor-upsert", { status: "ok", detail: "Reused existing vendor" });
        return true;
      }
      try {
        const slug = `${slugify(ctx.storeName)}-${ctx.userId.slice(0, 6)}`;
        const { data, error } = await supabase
          .from("vendors")
          .insert({ owner_id: ctx.userId, store_name: ctx.storeName, slug })
          .select("id")
          .single();
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
      update("vendor-role", { status: "running" });
      try {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: ctx.userId, role: "vendor" });
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
      update("product-insert", { status: "running" });
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
        const { data, error } = await supabase
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
          .single();
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
      update("product-readback", { status: "running" });
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
        const { data, error } = await supabase
          .from("products")
          .select("id")
          .eq("vendor_id", vendorId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(50);
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
            <div className="flex gap-3">
              <Button onClick={runAll} disabled={!!running || !user}>
                {running === "all" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Run diagnostics
              </Button>
              <Button variant="outline" onClick={reset} disabled={!!running}>
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Steps</CardTitle>
            <CardDescription>Retry only the failing step without restarting the whole flow</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {steps.map((s, i) => {
                const isRunningThis = running === s.id;
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
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-sm">
                          {i + 1}. {s.label}
                        </p>
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
                    </div>
                  </li>
                );
              })}
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
