import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getMyCart } from "@/lib/cart.functions";
import { initializeCheckout } from "@/lib/checkout.functions";
import { formatNaira } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
  head: () => ({ meta: [{ title: "Checkout — ecove" }] }),
});

function CheckoutPage() {
  const { user, loading } = useAuth();
  const getCart = useServerFn(getMyCart);
  const initFn = useServerFn(initializeCheckout);

  const { data } = useQuery({
    queryKey: ["my-cart"],
    queryFn: () => getCart(),
    enabled: !!user,
  });

  const [form, setForm] = useState({
    full_name: "",
    email: user?.email ?? "",
    phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    country: "Nigeria",
  });

  const mutation = useMutation({
    mutationFn: () => initFn({ data: { shipping: form } }),
    onSuccess: (res) => {
      window.location.href = res.authorization_url;
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (loading) return <div className="p-10 text-center">Loading…</div>;
  if (!user)
    return (
      <div className="p-10 text-center">
        <Link to="/login" className="text-primary underline">
          Sign in to checkout
        </Link>
      </div>
    );

  const items = data?.items ?? [];
  const subtotal = data?.subtotal_kobo ?? 0;

  if (items.length === 0)
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="text-muted-foreground">Your cart is empty.</p>
        <Link to="/cart" className="mt-4 inline-block text-primary underline">
          Back to cart
        </Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Checkout</h1>
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <form
          className="space-y-4 rounded-lg border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <h2 className="text-lg font-semibold">Shipping details</h2>
          <Field label="Full name" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
            <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required />
          </div>
          <Field label="Address line 1" value={form.address_line1} onChange={(v) => setForm({ ...form, address_line1: v })} required />
          <Field label="Address line 2 (optional)" value={form.address_line2} onChange={(v) => setForm({ ...form, address_line2: v })} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} required />
            <Field label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} required />
            <Field label="Country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} required />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Initializing…" : `Pay ${formatNaira(subtotal)} with Paystack`}
          </Button>
        </form>

        <aside className="h-fit rounded-lg border bg-card p-5">
          <h2 className="text-lg font-semibold">Summary</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-2">
                <span className="truncate">{i.product_title} × {i.quantity}</span>
                <span className="font-medium">{formatNaira(i.unit_price_kobo * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t pt-3 font-semibold">
            <span>Total</span>
            <span>{formatNaira(subtotal)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
    </div>
  );
}
