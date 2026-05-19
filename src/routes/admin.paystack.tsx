import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { AdminShell } from "@/components/admin-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

import { getPaystackWebhookStatus } from "@/lib/webhooks.functions";
import { testPlatformService } from "@/lib/platform-tests.functions";

export const Route = createFileRoute("/admin/paystack")({
  component: AdminPaystackDiagnostics,
});

type TestKey = "paystack" | "paystack_webhook" | "rate_limit";
type TestState = {
  running: boolean;
  ok?: boolean;
  message?: string;
  detail?: string;
};

function AdminPaystackDiagnostics() {
  const fetchStatus = useServerFn(getPaystackWebhookStatus);
  const runTest = useServerFn(testPlatformService);

  const { data: status, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["paystack-webhook-status"],
    queryFn: () => fetchStatus(),
  });

  const [tests, setTests] = useState<Record<TestKey, TestState>>({
    paystack: { running: false },
    paystack_webhook: { running: false },
    rate_limit: { running: false },
  });

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/paystack-webhook`
      : "/api/public/paystack-webhook";

  async function run(service: TestKey) {
    setTests((t) => ({ ...t, [service]: { running: true } }));
    try {
      const res = await runTest({ data: { service } });
      setTests((t) => ({
        ...t,
        [service]: { running: false, ok: res.ok, message: res.message, detail: res.detail },
      }));
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } catch (e) {
      setTests((t) => ({
        ...t,
        [service]: { running: false, ok: false, message: (e as Error).message },
      }));
      toast.error((e as Error).message);
    }
  }

  async function runAll() {
    await run("paystack");
    await run("paystack_webhook");
    await run("rate_limit");
  }

  return (
    <AdminShell
      title="Paystack diagnostics"
      subtitle="Register the live webhook, verify signatures, and stress-test rate limiting"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Live webhook URL</CardTitle>
            <CardDescription>
              Add this exact URL inside Paystack Dashboard → Settings → API Keys &
              Webhooks → Webhook URL. Use the same value for both live and test mode.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                {webhookUrl}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  toast.success("Copied");
                }}
              >
                <Copy className="mr-1 h-4 w-4" /> Copy
              </Button>
            </div>
            <Alert>
              <AlertTitle>Before going live</AlertTitle>
              <AlertDescription>
                Ensure <code>PAYSTACK_SECRET_KEY</code> starts with <code>sk_live_</code> and
                <code> PAYSTACK_WEBHOOK_SECRET</code> matches the value shown in your Paystack
                dashboard. Run all checks below before sending real charges.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Verification tests</CardTitle>
                <CardDescription>
                  Live transfer auth, signature path, and rate-limit harness.
                </CardDescription>
              </div>
              <Button onClick={runAll} size="sm">
                Run all
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <TestRow
              label="Paystack API key (live transfer auth)"
              hint="Calls /balance with the configured secret key"
              state={tests.paystack}
              onRun={() => run("paystack")}
            />
            <TestRow
              label="Webhook signature path"
              hint="Validates HMAC-SHA512 signing with PAYSTACK_WEBHOOK_SECRET"
              state={tests.paystack_webhook}
              onRun={() => run("paystack_webhook")}
            />
            <TestRow
              label="Public webhook rate-limit"
              hint="Fires 25 bogus signatures at the live endpoint to confirm 429s"
              state={tests.rate_limit}
              onRun={() => run("rate_limit")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Webhook deliveries</CardTitle>
                <CardDescription>Recent events recorded by the live endpoint.</CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {status && (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Stat label="Secret configured" value={status.configured ? "Yes" : "No"} ok={status.configured} />
                  <Stat label="Total events" value={String(status.total)} />
                  <Stat label="Last 24h" value={String(status.last24h)} />
                  <Stat label="Unprocessed" value={String(status.unprocessed)} warn={status.unprocessed > 0} />
                </div>

                {status.lastEvent && (
                  <div className="rounded border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Last event</span>
                      <Badge variant="outline">{status.lastEvent.event_type}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      ref: <span className="font-mono">{status.lastEvent.reference ?? "—"}</span> ·
                      received {new Date(status.lastEvent.received_at).toLocaleString()} ·
                      processed {status.lastEvent.processed_at ? new Date(status.lastEvent.processed_at).toLocaleString() : "—"}
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-1 text-sm">
                  {status.recent.length === 0 && (
                    <p className="text-muted-foreground">No webhook events received yet.</p>
                  )}
                  {status.recent.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between border-b py-2 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{e.event_type}</Badge>
                        <span className="font-mono text-xs">{e.reference ?? "—"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(e.received_at).toLocaleString()}
                        {e.processed_at ? " · processed" : " · pending"}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}

function Stat({
  label,
  value,
  ok,
  warn,
}: {
  label: string;
  value: string;
  ok?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded border p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold ${
          ok ? "text-emerald-600" : warn ? "text-amber-600" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TestRow({
  label,
  hint,
  state,
  onRun,
}: {
  label: string;
  hint: string;
  state: TestState;
  onRun: () => void;
}) {
  return (
    <div className="rounded border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
          {state.message && (
            <p
              className={`mt-1 text-sm ${
                state.ok ? "text-emerald-600" : "text-destructive"
              }`}
            >
              {state.ok ? (
                <CheckCircle2 className="mr-1 inline h-4 w-4" />
              ) : (
                <XCircle className="mr-1 inline h-4 w-4" />
              )}
              {state.message}
            </p>
          )}
          {state.detail && (
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
              {state.detail}
            </p>
          )}
        </div>
        <Button size="sm" onClick={onRun} disabled={state.running}>
          {state.running ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run"}
        </Button>
      </div>
    </div>
  );
}
