import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";
import { getPublicProductBySlug, type PublicProduct } from "@/lib/public-products.functions";

const APP_ORIGIN = "https://ecove-connect.lovable.app";

export const Route = createFileRoute("/products/$slug")({
  loader: async ({ params }) => {
    const product = await getPublicProductBySlug({ data: { slug: params.slug } });
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData, params }) => {
    const p = loaderData?.product as PublicProduct | undefined;
    if (!p) return { meta: [{ title: "Product — ecove" }] };
    const price = (p.price_kobo / 100).toFixed(2);
    const img = p.images[0]?.url;
    const desc =
      (p.description ?? "").slice(0, 155) ||
      `Buy ${p.title} on ecove — secure Naira checkout, fast delivery.`;
    const url = `${APP_ORIGIN}/products/${params.slug}`;
    return {
      meta: [
        { title: `${p.title} — ecove` },
        { name: "description", content: desc },
        { property: "og:title", content: p.title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        ...(img ? [{ property: "og:image", content: img }] : []),
        ...(img ? [{ name: "twitter:image", content: img }] : []),
        { name: "twitter:card", content: img ? "summary_large_image" : "summary" },
        { property: "product:price:amount", content: price },
        { property: "product:price:currency", content: "NGN" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: p.title,
            description: desc,
            image: p.images.map((i) => i.url),
            sku: p.id,
            offers: {
              "@type": "Offer",
              priceCurrency: "NGN",
              price,
              availability:
                p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              url,
            },
            ...(p.vendor ? { brand: { "@type": "Brand", name: p.vendor.name } } : {}),
          }),
        },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Product not available</h1>
        <p className="text-muted-foreground mt-2">It may have been removed or is not yet approved.</p>
        <Link to="/" className="text-primary mt-4 inline-block">← Back to shop</Link>
      </div>
    </div>
  ),
  component: ProductPage,
});

function ProductPage() {
  const { product } = Route.useLoaderData();
  const [activeImg, setActiveImg] = useState(0);
  const naira = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const inStock = product.stock > 0;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto max-w-6xl px-4 py-8">
        <nav className="text-xs text-muted-foreground mb-4">
          <Link to="/" className="hover:underline">Home</Link>
          <span className="mx-2">/</span>
          <span>{product.title}</span>
        </nav>

        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <div className="aspect-square w-full overflow-hidden rounded-lg border border-border bg-muted">
              {product.images[activeImg] ? (
                <img
                  src={product.images[activeImg].url}
                  alt={product.images[activeImg].alt ?? product.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  No image
                </div>
              )}
            </div>
            {product.images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {product.images.map((img: PublicProduct["images"][number], i: number) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveImg(i)}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded border ${
                      i === activeImg ? "border-primary ring-2 ring-primary" : "border-border"
                    }`}
                  >
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <h1 className="text-2xl font-bold md:text-3xl">{product.title}</h1>
            {product.vendor && (
              <p className="text-sm text-muted-foreground mt-1">
                Sold by <span className="font-medium text-foreground">{product.vendor.name}</span>
              </p>
            )}

            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-primary">{naira(product.price_kobo)}</span>
              {product.compare_at_kobo && product.compare_at_kobo > product.price_kobo && (
                <span className="text-sm text-muted-foreground line-through">
                  {naira(product.compare_at_kobo)}
                </span>
              )}
            </div>

            <div className="mt-3">
              {inStock ? (
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  In stock ({product.stock} available)
                </Badge>
              ) : (
                <Badge variant="destructive">Out of stock</Badge>
              )}
            </div>

            {product.description && (
              <div className="prose prose-sm mt-6 max-w-none whitespace-pre-wrap text-foreground/80">
                {product.description}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <Button asChild disabled={!inStock} size="lg" className="flex-1">
                <Link to="/cart">{inStock ? "Add to cart" : "Out of stock"}</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
