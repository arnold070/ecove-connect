import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle, Loader2, PlayCircle } from "lucide-react";

import { AdminShell } from "@/components/admin-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { runReadinessChecks, type ReadinessItem } from "@/lib/readiness.functions";
import { testPlatformService } from "@/lib/platform-tests.functions";

export const Route = createFileRoute("/admin/readiness")({
  component: ReadinessPage,
  head: () => ({ meta: [{ title: "Production readiness — ecove admin" }] }),
});

type PlatformTest =
  | "paystack"
  | "paystack_webhook"
  | "resend"
  | "rate_limit"
  | "webhook_replay"
  | "sentry"
  | "cloudinary";

const PLATFORM_TESTS: { id: PlatformTest; label: string }[] = [
  { id: "paystack", label: "Paystack API connectivity" },
  { id: "paystack_webhook", label: "Paystack webhook signature" },
  { id: "webhook_replay", label: "Webhook replay protection" },
  { id: "resend", label: "Resend email send" },
  { id: "rate_limit", label: "Rate-limit RPC" },
  { id: "cloudinary", label: "Cloudinary credentials" },
  { id: "sentry", label: "Sentry DSN" },
];

function ReadinessPage() {
  const runChecks = useServerFn(runReadinessChecks);
  const runTest = useServerFn(testPlatformService);

  const [items, setItems] = useState<ReadinessItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tests, setTests] = useState<Record<string, { running: boolean; ok?: boolean; message?: string }>>({});

  async function runAll() {
    setLoading(true);
    try {
      const res = await runChecks();
      setItems(res);
      // Run platform tests in sequence (some hit live services)
      for (const t of PLATFORM_TESTS) {
        setTests((s) => ({ ...s, [t.id]: { running: true } }));
        try {
          const r = await runTest({ data: { service: t.id } });
          setTests((s) => ({ ...s, [t.id]: { running: false, ok: r.ok, message: r.message } }));
        } catch (e) {
          setTests((s) => ({
            ...s,
            [t.id]: { running: false, ok: false, message: (e as Error).message },
          }));
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const blockers = items?.filter((i) => !i.ok) ?? [];
  const passing = items?.filter((i) => i.ok) ?? [];
  const testFailures = Object.entries(tests).filter(([, t]) => t.ok === false);

  return (
    <AdminShell
      title="Production readiness"
      subtitle="One-click check that all secrets, buckets, migrations, and integrations are live-ready."
    >
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Pre-launch checklist</CardTitle>
              <CardDescription>
                Runs config, secret, storage, and migration checks plus live integration self-tests.
              </CardDescription>
            </div>
            <Button onClick={runAll} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              {loading ? "Running…" : "Run all checks"}
            </Button>
          </CardHeader>
          <CardContent>
            {items === null ? (
              <p className="text-sm text-muted-foreground">No checks run yet.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Badge variant={blockers.length === 0 ? "default" : "destructive"}>
                  {blockers.length} blocker{blockers.length === 1 ? "" : "s"}
                </Badge>
                <Badge variant="secondary">{passing.length} passing</Badge>
                {testFailures.length > 0 && (
                  <Badge variant="destructive">{testFailures.length} integration failure(s)</Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {items && (
          <Card>
            <CardHeader>
              <CardTitle>Configuration checks</CardTitle>
              <CardDescription>Secrets, storage buckets, migrations, and seed data.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {items.map((i) => (
                <div key={i.id} className="flex items-start gap-3 py-3 text-sm">
                  {i.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{i.label}</p>
                    <p className="text-xs text-muted-foreground">{i.message}</p>
                    {i.detail && <p className="mt-0.5 text-[11px] text-muted-foreground/70">{i.detail}</p>}
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {i.category}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {Object.keys(tests).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Integration self-tests</CardTitle>
              <CardDescription>Live calls to Paystack, Resend, Cloudinary, Sentry and webhook replay.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {PLATFORM_TESTS.map((t) => {
                const r = tests[t.id];
                return (
                  <div key={t.id} className="flex items-start gap-3 py-3 text-sm">
                    {r?.running ? (
                      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : r?.ok === true ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    ) : r?.ok === false ? (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-border" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground">{r?.message ?? "—"}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
