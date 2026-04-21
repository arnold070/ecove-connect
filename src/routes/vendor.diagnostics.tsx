import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, Circle, AlertCircle } from "lucide-react";

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
interface Step {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

const INITIAL_STEPS: Step[] = [
  { id: "auth", label: "Verify signed-in user", status: "pending" },
  { id: "vendor-lookup", label: "Look up existing vendor row", status: "pending" },
  { id: "vendor-upsert", label: "Create or reuse vendor row", status: "pending" },
  { id: "vendor-role", label: "Ensure 'vendor' role in user_roles", status: "pending" },
  { id: "product-insert", label: "Insert test product as 'pending'", status: "pending" },
  { id: "product-readback", label: "Read it back from /vendor/products/pending query", status: "pending" },
];

function fmtErr(e: unknown): string {
  const x = e as { message?: string; code?: string; details?: string; hint?: string };
  return [x?.message, x?.code && `code: ${x.code}`, x?.details && `details: ${x.details}`, x?.hint && `hint: ${x.hint}`]
    .filter(Boolean)
    .join(" — ") || String(e);
}

function VendorDiagnosticsPage() {
  const { user, loading: authLoading } = useAuth();
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [running, setRunning] = useState(false);
  const [storeName, setStoreName] = useState("Diagnostic Store");
  const [productTitle, setProductTitle] = useState("Diagnostic Product");
  const [createdProductId, setCreatedProductId] = useState<string | null>(null);

  const update = (id: string, patch: Partial<Step>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const reset = () => {
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
    setCreatedProductId(null);
  };

  const run = async () => {
    if (!user) return;
    reset();
    setRunning(true);

    // 1. Auth
    update("auth", { status: "running" });
    update("auth", { status: "ok", detail: `user.id = ${user.id}` });

    // 2. Vendor lookup
    update("vendor-lookup", { status: "running" });
    let vendorId: string | null = null;
    try {
      const { data, error } = await supabase
        .from("vendors")
        .select("id, slug, store_name")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        vendorId = data.id;
        update("vendor-lookup", { status: "ok", detail: `Found vendor ${data.slug}` });
      } else {
        update("vendor-lookup", { status: "ok", detail: "No vendor row yet" });
      }
    } catch (e) {
      update("vendor-lookup", { status: "fail", detail: fmtErr(e) });
      setRunning(false);
      return;
    }

    // 3. Vendor upsert
    update("vendor-upsert", { status: "running" });
    if (!vendorId) {
      try {
        const slug = `${slugify(storeName)}-${user.id.slice(0, 6)}`;
        const { data, error } = await supabase
          .from("vendors")
          .insert({ owner_id: user.id, store_name: storeName, slug })
          .select("id")
          .single();
        if (error) throw error;
        vendorId = data.id;
        update("vendor-upsert", { status: "ok", detail: `Created vendor ${vendorId}` });
      } catch (e) {
        update("vendor-upsert", { status: "fail", detail: fmtErr(e) });
        setRunning(false);
        return;
      }
    } else {
      update("vendor-upsert", { status: "ok", detail: "Reused existing vendor" });
    }

    // 4. Vendor role
    update("vendor-role", { status: "running" });
    try {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: user.id, role: "vendor" });
      if (error && !/duplicate|unique/i.test(error.message)) throw error;
      update("vendor-role", { status: "ok", detail: error ? "Already had role" : "Inserted vendor role" });
    } catch (e) {
      update("vendor-role", { status: "fail", detail: fmtErr(e) });
      setRunning(false);
      return;
    }

    // 5. Product insert (matches columns used by /vendor/products/new)
    update("product-insert", { status: "running" });
    let productId: string | null = null;
    try {
      const stamp = Date.now();
      const title = `${productTitle} ${stamp}`;
      const slug = `${slugify(title)}-${user.id.slice(0, 6)}`;
      const { data, error } = await supabase
        .from("products")
        .insert({
          vendor_id: vendorId,
          title,
          slug,
          description: "Auto-generated by diagnostics",
          price_kobo: 999900, // ₦9,999.00 in kobo
          stock: 1,
          status: "pending",
        })
        .select("id, status, slug, price_kobo")
        .single();
      if (error) throw error;
      productId = data.id;
      setCreatedProductId(productId);
      update("product-insert", {
        status: "ok",
        detail: `Inserted product ${productId} (status=${data.status}, slug=${data.slug}, price_kobo=${data.price_kobo})`,
      });
    } catch (e) {
      update("product-insert", { status: "fail", detail: fmtErr(e) });
      setRunning(false);
      return;
    }

    // 6. Read back from pending list
    update("product-readback", { status: "running" });
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
    } catch (e) {
      update("product-readback", { status: "fail", detail: fmtErr(e) });
      setRunning(false);
      return;
    }

    setRunning(false);
  };

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
              <Input
                id="product_title"
                value={productTitle}
                onChange={(e) => setProductTitle(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={run} disabled={running || !user}>
                {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Run diagnostics
              </Button>
              <Button variant="outline" onClick={reset} disabled={running}>
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Steps</CardTitle>
            <CardDescription>Each step uses the same code path as the real UI</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {steps.map((s, i) => (
                <li key={s.id} className="flex gap-3 items-start">
                  <div className="pt-0.5">
                    {s.status === "ok" && <CheckCircle2 className="h-5 w-5 text-primary" />}
                    {s.status === "fail" && <XCircle className="h-5 w-5 text-destructive" />}
                    {s.status === "running" && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                    {s.status === "pending" && <Circle className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {i + 1}. {s.label}
                    </p>
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
              ))}
            </ol>
          </CardContent>
        </Card>

        {createdProductId && (
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
