import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyCart, updateCartItem, clearCart } from "@/lib/cart.functions";
import { formatNaira } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";

export const Route = createFileRoute("/cart")({
  component: CartPage,
  head: () => ({ meta: [{ title: "Cart — ecove" }] }),
});

function CartPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getCart = useServerFn(getMyCart);
  const updateFn = useServerFn(updateCartItem);
  const clearFn = useServerFn(clearCart);

  const { data, isLoading } = useQuery({
    queryKey: ["my-cart"],
    queryFn: () => getCart(),
    enabled: !!user,
  });

  const update = useMutation({
    mutationFn: (vars: { item_id: string; quantity: number }) =>
      updateFn({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-cart"] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const clear = useMutation({
    mutationFn: () => clearFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-cart"] });
      toast.success("Cart cleared");
    },
  });

  if (loading) return <div className="p-10 text-center">Loading…</div>;
  if (!user) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <h1 className="text-xl font-semibold">Sign in to view your cart</h1>
        <Link to="/login" className="mt-4 inline-block text-primary underline">
          Sign in
        </Link>
      </div>
    );
  }

  const items = data?.items ?? [];
  const subtotal = data?.subtotal_kobo ?? 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-semibold">
        <ShoppingBag className="h-6 w-6" /> Your cart
      </h1>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      {!isLoading && items.length === 0 && (
        <div className="rounded-lg border bg-card p-10 text-center">
          <p className="text-muted-foreground">Your cart is empty.</p>
          <Link to="/" className="mt-4 inline-block">
            <Button>Continue shopping</Button>
          </Link>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded bg-muted">
                  {it.image_url && (
                    <img
                      src={it.image_url}
                      alt={it.product_title}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{it.product_title}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatNaira(it.unit_price_kobo)}
                  </p>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={Math.max(1, it.in_stock)}
                  value={it.quantity}
                  onChange={(e) =>
                    update.mutate({
                      item_id: it.id,
                      quantity: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="w-20"
                />
                <div className="w-24 text-right font-medium">
                  {formatNaira(it.unit_price_kobo * it.quantity)}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => update.mutate({ item_id: it.id, quantity: 0 })}
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => clear.mutate()}
              disabled={clear.isPending}
            >
              Clear cart
            </Button>
          </div>

          <aside className="h-fit rounded-lg border bg-card p-5">
            <h2 className="text-lg font-semibold">Order summary</h2>
            <div className="mt-3 flex justify-between text-sm">
              <span>Subtotal</span>
              <span className="font-medium">{formatNaira(subtotal)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm text-muted-foreground">
              <span>Shipping</span>
              <span>Calculated at checkout</span>
            </div>
            <Button
              className="mt-4 w-full"
              onClick={() => navigate({ to: "/checkout" })}
            >
              Proceed to checkout
            </Button>
          </aside>
        </div>
      )}
    </div>
  );
}
