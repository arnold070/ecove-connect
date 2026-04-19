import { Heart, Plus } from "lucide-react";
import type { SampleProduct } from "@/lib/sample-products";
import { formatNaira } from "@/lib/currency";

const badgeStyles: Record<SampleProduct["badge"], string> = {
  SALE: "bg-destructive text-destructive-foreground",
  HOT: "bg-primary text-primary-foreground",
  NEW: "bg-success text-success-foreground",
  DEAL: "bg-accent text-accent-foreground",
};

export function ProductCard({ product }: { product: SampleProduct }) {
  // formatNaira expects kobo (per src/lib/currency.ts) — multiply whole-naira amounts by 100.
  const current = formatNaira(product.price * 100);
  const old = formatNaira(product.old * 100);
  const save = formatNaira((product.old - product.price) * 100);
  const filled = Math.floor(product.rating);

  return (
    <div className="group relative flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative flex aspect-square items-center justify-center bg-muted">
        <span className="text-6xl transition group-hover:scale-110">{product.icon}</span>
        <span
          className={`absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeStyles[product.badge]}`}
        >
          {product.badge}
        </span>
        <button
          type="button"
          aria-label="Add to wishlist"
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition hover:bg-primary hover:text-primary-foreground"
        >
          <Heart className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="absolute inset-x-2 bottom-2 flex translate-y-2 items-center justify-center gap-1 rounded-md bg-primary py-2 text-xs font-semibold text-primary-foreground opacity-0 shadow-md transition group-hover:translate-y-0 group-hover:opacity-100"
        >
          <Plus className="h-3.5 w-3.5" /> Add to cart
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h4 className="line-clamp-2 text-sm font-medium leading-tight text-foreground">
          {product.name}
        </h4>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold text-foreground">{current}</span>
          <span className="text-xs text-muted-foreground line-through">{old}</span>
        </div>
        <p className="text-[11px] font-semibold text-destructive">
          Save {save} ({product.discount}% off)
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="text-warning">
            {"★".repeat(filled)}
            <span className="text-border">{"★".repeat(5 - filled)}</span>
          </span>
          <span>
            {product.rating} ({product.reviews})
          </span>
          <span className="ml-auto inline-flex items-center gap-1 font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> In stock
          </span>
        </div>
      </div>
    </div>
  );
}
