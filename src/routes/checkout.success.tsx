import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { verifyCheckout } from "@/lib/checkout.functions";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { z } from "zod";

export const Route = createFileRoute("/checkout/success")({
  validateSearch: z.object({
    reference: z.string().optional(),
    trxref: z.string().optional(),
  }),
  component: SuccessPage,
  head: () => ({ meta: [{ title: "Payment status — ecove" }] }),
});

function SuccessPage() {
  const { reference, trxref } = useSearch({ from: "/checkout/success" });
  const ref = reference || trxref;
  const verifyFn = useServerFn(verifyCheckout);
  const [state, setState] = useState<"verifying" | "paid" | "pending" | "error">("verifying");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!ref) {
      setState("error");
      setMsg("Missing reference");
      return;
    }
    verifyFn({ data: { reference: ref } })
      .then((r) => {
        setState(r.status === "paid" ? "paid" : "pending");
      })
      .catch((e) => {
        setState("error");
        setMsg((e as Error).message);
      });
  }, [ref, verifyFn]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      {state === "verifying" && (
        <>
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Verifying your payment…</p>
        </>
      )}
      {state === "paid" && (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
          <h1 className="mt-4 text-2xl font-semibold">Payment successful</h1>
          <p className="mt-2 text-muted-foreground">
            Your order has been received and is being processed.
          </p>
          <Link to="/" className="mt-6 inline-block">
            <Button>Back to shop</Button>
          </Link>
        </>
      )}
      {state === "pending" && (
        <>
          <Loader2 className="mx-auto h-10 w-10 text-warning" />
          <h1 className="mt-4 text-xl font-semibold">Payment is pending</h1>
          <p className="mt-2 text-muted-foreground">
            We haven't received confirmation from Paystack yet. This page will update once the webhook arrives.
          </p>
        </>
      )}
      {state === "error" && (
        <>
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 text-xl font-semibold">Couldn't verify payment</h1>
          <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
        </>
      )}
    </div>
  );
}
