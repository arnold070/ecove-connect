import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { formatNaira } from "@/lib/currency";
import { absoluteUrl } from "@/lib/site-url";
import { getPublicVendorBySlug } from "@/lib/public-vendors.functions";

export const Route = createFileRoute("/vendors/$slug")({
  loader: async ({ params }) => {
    const vendor = await getPublicVendorBySlug({ data: { slug: params.slug } });
    if (!vendor) throw notFound();
    return { vendor };
  },
  head: ({ params, loaderData }) => {
    const v = loaderData?.vendor;
    const title = v ? `${v.store_name} on ecove` : "Vendor — ecove";
    const desc =
      v?.description ??
      (v ? `Shop ${v.store_name}'s catalogue on ecove.` : "Vendor storefront on ecove.");
    const url = absoluteUrl(`/vendors/${params.slug}`);
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "profile" },
        { property: "og:url", content: url },
        ...(v?.logo_url ? [{ property: "og:image", content: v.logo_url }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: v
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Store",
                name: v.store_name,
                url,
                image: v.logo_url ?? undefined,
                aggregateRating:
                  v.rating_count > 0
                    ? {
                        "@type": "AggregateRating",
                        ratingValue: v.rating_avg,
                        reviewCount: v.rating_count,
                      }
                    : undefined,
              }),
            },
          ]
        : undefined,
    };
  },
  component: VendorPage,
  notFoundComponent: () => (
    <main className="mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl font-bold">Vendor not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This shop may have been removed or is not yet approved.
      </p>
      <Link to="/" className="mt-4 inline-block text-primary underline">Back to home</Link>
    </main>
  ),
});

function VendorPage() {
  const { vendor } = Route.useLoaderData();
  return (
    <>
      <SiteHeader />
      {vendor.banner_url && (
        <div className="h-40 w-full bg-muted bg-cover bg-center md:h-56" style={{ backgroundImage: `url(${vendor.banner_url})` }} />
      )}
      <main className="mx-auto max-w-6xl px-4 py-8">
        <header className="flex items-center gap-4">
          {vendor.logo_url && (
            <img src={vendor.logo_url} alt={vendor.store_name} className="h-16 w-16 rounded-full border border-border object-cover" />
          )}
          <div>
            <h1 className="font-display text-2xl font-extrabold">{vendor.store_name}</h1>
            {vendor.rating_count > 0 && (
              <p className="text-sm text-muted-foreground">
                ★ {vendor.rating_avg.toFixed(1)} ({vendor.rating_count} reviews)
              </p>
            )}
          </div>
        </header>
        {vendor.description && (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-foreground/80">{vendor.description}</p>
        )}

        <h2 className="mt-8 font-display text-lg font-bold">Products</h2>
        {vendor.products.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No live products yet.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {vendor.products.map((p) => (
              <Link
                key={p.id}
                to="/products/$slug"
                params={{ slug: p.slug }}
                className="group block overflow-hidden rounded-lg border border-border bg-card transition hover:shadow-md"
              >
                <div className="aspect-square w-full bg-muted">
                  {p.image && (
                    <img src={p.image} alt={p.title} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                  )}
                </div>
                <div className="p-3">
                  <h3 className="line-clamp-2 text-sm font-medium">{p.title}</h3>
                  <p className="mt-1 text-sm font-bold text-primary">{formatNaira(p.price_kobo)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
