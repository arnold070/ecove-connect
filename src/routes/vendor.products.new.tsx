import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ImagePlus, Plus, Trash2, X, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { VendorShell } from "@/components/vendor-shell";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { uniqueSlug } from "@/lib/slug";
import { formatNaira, nairaToKobo } from "@/lib/currency";

export const Route = createFileRoute("/vendor/products/new")({
  component: NewProductPage,
  head: () => ({
    meta: [{ title: "Add New Product — Vendor — ecove" }],
  }),
});

const HANDLING_TIMES = [
  "Same day",
  "1-2 business days",
  "2-3 business days",
  "3-5 business days",
] as const;

const variantSchema = z.object({
  name: z.string().trim().max(60).optional().or(z.literal("")),
  value: z.string().trim().max(60).optional().or(z.literal("")),
  stock: z.coerce.number().int().min(0).optional(),
});

const productSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Product name must be at least 3 characters")
      .max(160, "Keep the title under 160 characters"),
    category_id: z.string().uuid({ message: "Select a category" }),
    brand: z.string().trim().max(80).optional().or(z.literal("")),
    short_description: z
      .string()
      .trim()
      .min(10, "Add a short summary (≥10 chars)")
      .max(120, "Keep the short description under 120 characters"),
    description: z
      .string()
      .trim()
      .min(20, "Add a fuller description (≥20 chars)")
      .max(8000),
    specifications: z.string().trim().max(4000).optional().or(z.literal("")),
    tags: z.string().trim().max(400).optional().or(z.literal("")),
    price_naira: z.coerce.number().positive("Price must be greater than 0"),
    compare_at_naira: z.coerce.number().nonnegative().optional().or(z.literal("")),
    stock: z.coerce.number().int().min(0, "Stock cannot be negative"),
    low_stock_alert: z.coerce.number().int().min(0).optional().or(z.literal("")),
    sku: z.string().trim().max(80).optional().or(z.literal("")),
    weight_kg: z.coerce.number().min(0).optional().or(z.literal("")),
    handling_time: z.string().min(1),
    ships_from: z.string().trim().max(120).optional().or(z.literal("")),
    free_shipping: z.boolean(),
    variants: z.array(variantSchema),
  })
  .refine(
    (d) =>
      d.compare_at_naira === undefined ||
      d.compare_at_naira === ("" as unknown as number) ||
      Number(d.compare_at_naira) === 0 ||
      Number(d.compare_at_naira) >= Number(d.price_naira),
    {
      path: ["compare_at_naira"],
      message: "Compare-at price should be higher than the selling price",
    },
  );

type ProductFormValues = z.infer<typeof productSchema>;

interface CategoryRow {
  id: string;
  name: string;
}

interface VendorRow {
  id: string;
  store_name: string;
  status: "pending" | "approved" | "suspended" | "rejected";
  commission_bps: number;
}

interface PreviewImage {
  id: string;
  file: File;
  url: string;
}

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function NewProductPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [vendor, setVendor] = useState<VendorRow | null>(null);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [images, setImages] = useState<PreviewImage[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      title: "",
      category_id: "",
      brand: "",
      short_description: "",
      description: "",
      specifications: "",
      tags: "",
      price_naira: 0,
      compare_at_naira: "" as unknown as number,
      stock: 0,
      low_stock_alert: "" as unknown as number,
      sku: "",
      weight_kg: "" as unknown as number,
      handling_time: "1-2 business days",
      ships_from: "Lagos, Nigeria",
      free_shipping: false,
      variants: [],
    },
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const variantsField = useFieldArray({ control, name: "variants" });
  const watchedPrice = watch("price_naira");
  const freeShipping = watch("free_shipping");

  // Load categories + current vendor.
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data: cats } = await supabase
        .from("categories")
        .select("id, name")
        .order("position", { ascending: true });
      if (mounted && cats) setCategories(cats as CategoryRow[]);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setVendorLoading(false);
      return;
    }
    let mounted = true;
    void (async () => {
      const { data } = await supabase
        .from("vendors")
        .select("id, store_name, status, commission_bps")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (!mounted) return;
      setVendor(data as VendorRow | null);
      setVendorLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  // Cleanup blob URLs on unmount.
  useEffect(() => {
    return () => {
      images.forEach((i) => URL.revokeObjectURL(i.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImagePick = (files: FileList | null) => {
    if (!files) return;
    const remaining = MAX_IMAGES - images.length;
    const next: PreviewImage[] = [];
    for (const file of Array.from(files).slice(0, remaining)) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        toast.error(`${file.name}: only JPG, PNG, WEBP allowed`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name}: must be ≤ 5MB`);
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      });
    }
    setImages((prev) => [...prev, ...next]);
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((i) => i.id !== id);
    });
  };

  const commissionBps = vendor?.commission_bps ?? 1000;
  const commissionPct = (commissionBps / 100).toFixed(0);
  const commissionAmount = Number.isFinite(Number(watchedPrice))
    ? Math.round(Number(watchedPrice) * (commissionBps / 10_000))
    : 0;
  const payoutAmount = Math.max(0, Number(watchedPrice || 0) - commissionAmount);

  const onSubmit: SubmitHandler<ProductFormValues> = async (values) => {
    if (!vendor) {
      toast.error("Set up your vendor store before listing products");
      return;
    }
    if (vendor.status !== "approved" && vendor.status !== "pending") {
      toast.error("Your vendor account is not eligible to list products");
      return;
    }
    if (images.length === 0) {
      toast.error("Add at least one product image");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Upload images to storage.
      const uploaded: { url: string; position: number }[] = [];
      for (let idx = 0; idx < images.length; idx++) {
        const img = images[idx];
        const ext = img.file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${user!.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("product-images")
          .upload(path, img.file, {
            cacheControl: "3600",
            upsert: false,
            contentType: img.file.type,
          });
        if (upErr) throw new Error(`Image upload failed: ${upErr.message}`);
        const { data: pub } = supabase.storage
          .from("product-images")
          .getPublicUrl(path);
        uploaded.push({ url: pub.publicUrl, position: idx });
      }

      // 2. Build description with optional specifications/tags appended.
      const extras: string[] = [];
      if (values.specifications && values.specifications.trim()) {
        extras.push(`\n\n## Specifications\n${values.specifications.trim()}`);
      }
      if (values.brand && values.brand.trim()) {
        extras.unshift(`Brand: ${values.brand.trim()}\n`);
      }
      const fullDescription =
        `${values.short_description.trim()}\n\n${values.description.trim()}${extras.join("")}` +
        (values.tags && values.tags.trim() ? `\n\nTags: ${values.tags.trim()}` : "");

      // 3. Insert product (status: pending).
      const compareAtKobo =
        values.compare_at_naira === undefined ||
        values.compare_at_naira === ("" as unknown as number) ||
        Number(values.compare_at_naira) === 0
          ? null
          : nairaToKobo(Number(values.compare_at_naira));
      const weightGrams =
        values.weight_kg === undefined ||
        values.weight_kg === ("" as unknown as number)
          ? null
          : Math.round(Number(values.weight_kg) * 1000);

      const { data: inserted, error: insErr } = await supabase
        .from("products")
        .insert({
          vendor_id: vendor.id,
          category_id: values.category_id,
          title: values.title.trim(),
          slug: uniqueSlug(values.title),
          description: fullDescription,
          price_kobo: nairaToKobo(Number(values.price_naira)),
          compare_at_kobo: compareAtKobo,
          stock: Number(values.stock),
          sku: values.sku?.trim() || null,
          weight_grams: weightGrams,
          status: "pending",
        })
        .select("id")
        .single();
      if (insErr || !inserted) {
        throw new Error(insErr?.message || "Failed to create product");
      }
      const productId = inserted.id as string;

      // 4. Insert images.
      if (uploaded.length > 0) {
        const { error: imgErr } = await supabase.from("product_images").insert(
          uploaded.map((u) => ({
            product_id: productId,
            url: u.url,
            position: u.position,
          })),
        );
        if (imgErr) throw new Error(`Saving images failed: ${imgErr.message}`);
      }

      // 5. Insert variants (only meaningful rows).
      const validVariants = values.variants.filter(
        (v) => (v.name && v.name.trim()) || (v.value && v.value.trim()),
      );
      if (validVariants.length > 0) {
        const { error: varErr } = await supabase.from("product_variants").insert(
          validVariants.map((v) => ({
            product_id: productId,
            name:
              [v.name, v.value].filter((s) => s && s.trim()).join(": ") ||
              "Variant",
            stock: Number(v.stock || 0),
          })),
        );
        if (varErr) throw new Error(`Saving variants failed: ${varErr.message}`);
      }

      toast.success("Product submitted for admin review");
      void navigate({ to: "/vendor/products/pending" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- guards ----

  if (authLoading || vendorLoading) {
    return (
      <VendorShell title="Add New Product" subtitle="Loading…">
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      </VendorShell>
    );
  }

  if (!vendor) {
    return (
      <VendorShell
        title="Add New Product"
        subtitle="Set up your vendor store first"
      >
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="flex items-start gap-3 p-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-600" />
            <div className="space-y-2">
              <p className="font-medium">No vendor store found.</p>
              <p className="text-sm text-muted-foreground">
                You need to create a vendor profile before you can list
                products on Ecove.
              </p>
              <Button asChild size="sm">
                <Link to="/vendor/profile">Set up store</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </VendorShell>
    );
  }

  return (
    <VendorShell
      title="Add New Product"
      subtitle="Submit a product for admin review before it goes live."
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 gap-6 lg:grid-cols-3"
      >
        {/* LEFT — main details */}
        <div className="space-y-6 lg:col-span-2">
          {/* Product details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">📝 Product Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Product Name *" error={errors.title?.message}>
                <Input
                  {...register("title")}
                  placeholder="e.g. Samsung Galaxy A55 5G 256GB Space Navy"
                />
              </Field>

              <Field
                label="Category *"
                error={errors.category_id?.message}
                hint="Categories are set by Ecove admin. You cannot add custom categories."
              >
                <Select
                  value={watch("category_id")}
                  onValueChange={(v) =>
                    setValue("category_id", v, { shouldValidate: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="— Select category —" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Brand" error={errors.brand?.message}>
                <Input
                  {...register("brand")}
                  placeholder="e.g. Samsung, Apple, Nike…"
                />
              </Field>

              <Field
                label="Short Description *"
                error={errors.short_description?.message}
                hint="One-line summary shown in listings (max 120 chars)"
              >
                <Input
                  {...register("short_description")}
                  maxLength={120}
                  placeholder="One-line summary shown in listings"
                />
              </Field>

              <Field
                label="Full Description *"
                error={errors.description?.message}
              >
                <Textarea
                  {...register("description")}
                  rows={6}
                  placeholder="Detailed product description. Include key features, dimensions, materials, what's in the box, etc."
                />
              </Field>

              <Field
                label="Specifications"
                error={errors.specifications?.message}
                hint="Key: Value pairs, one per line"
              >
                <Textarea
                  {...register("specifications")}
                  rows={5}
                  placeholder={`RAM: 12GB\nStorage: 256GB\nDisplay: 6.4" AMOLED\nBattery: 5000mAh`}
                />
              </Field>

              <Field label="Tags" error={errors.tags?.message}>
                <Input
                  {...register("tags")}
                  placeholder="samsung, galaxy, 5g, smartphone (comma separated)"
                />
              </Field>
            </CardContent>
          </Card>

          {/* Pricing & Stock */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">💰 Pricing & Stock</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Selling Price (₦) *"
                  error={errors.price_naira?.message}
                  hint={
                    Number(watchedPrice) > 0
                      ? `Your commission: ${commissionPct}% = ${formatNaira(commissionAmount)} → You receive ${formatNaira(payoutAmount)}`
                      : `Commission rate: ${commissionPct}%`
                  }
                >
                  <Input
                    type="number"
                    step="1"
                    min={0}
                    {...register("price_naira")}
                    placeholder="285000"
                  />
                </Field>
                <Field
                  label="Compare At Price (₦)"
                  error={errors.compare_at_naira?.message}
                  hint="Original price — shows as crossed out"
                >
                  <Input
                    type="number"
                    step="1"
                    min={0}
                    {...register("compare_at_naira")}
                    placeholder="320000"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Stock Quantity *" error={errors.stock?.message}>
                  <Input
                    type="number"
                    step="1"
                    min={0}
                    {...register("stock")}
                    placeholder="50"
                  />
                </Field>
                <Field
                  label="Low Stock Alert"
                  error={errors.low_stock_alert?.message}
                >
                  <Input
                    type="number"
                    step="1"
                    min={0}
                    {...register("low_stock_alert")}
                    placeholder="5"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="SKU" error={errors.sku?.message}>
                  <Input {...register("sku")} placeholder="SAM-A55-256-NAVY" />
                </Field>
                <Field label="Weight (kg)" error={errors.weight_kg?.message}>
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    {...register("weight_kg")}
                    placeholder="0.2"
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Variants */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">🎨 Product Variants</CardTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  variantsField.append({ name: "", value: "", stock: 0 })
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Add Variant
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {variantsField.fields.length === 0 ? (
                <p className="rounded-md bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                  No variants yet. Add one if your product comes in different
                  colors, sizes, or styles.
                </p>
              ) : (
                variantsField.fields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="rounded-md border bg-muted/30 p-3"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_120px_auto]">
                      <div className="space-y-1">
                        <Label className="text-xs">Variant Name</Label>
                        <Input
                          {...register(`variants.${idx}.name`)}
                          placeholder="Color"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Value</Label>
                        <Input
                          {...register(`variants.${idx}.value`)}
                          placeholder="Space Navy"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Stock</Label>
                        <Input
                          type="number"
                          min={0}
                          {...register(`variants.${idx}.stock`)}
                          placeholder="20"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => variantsField.remove(idx)}
                          aria-label="Remove variant"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — images, shipping, rules */}
        <div className="space-y-6">
          {/* Images */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">📷 Product Images</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label
                htmlFor="image-upload"
                className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-6 text-center transition-colors hover:border-primary hover:bg-primary/5"
              >
                <ImagePlus className="mb-2 h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">
                  Click to upload images
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  JPG/PNG/WEBP · Max 5MB each · Up to {MAX_IMAGES} images
                </span>
                <input
                  id="image-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleImagePick(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>

              <div className="grid grid-cols-4 gap-2">
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
                  >
                    <img
                      src={img.url}
                      alt={`Product ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                    {idx === 0 && (
                      <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary-foreground">
                        Main
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-0 shadow transition-opacity group-hover:opacity-100"
                      aria-label="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {Array.from({
                  length: Math.max(0, Math.min(4, MAX_IMAGES - images.length)),
                }).map((_, i) => (
                  <label
                    key={`slot-${i}`}
                    htmlFor="image-upload"
                    className="flex aspect-square cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/20 text-muted-foreground/40 hover:border-primary hover:text-primary"
                  >
                    <Plus className="h-4 w-4" />
                  </label>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                First image is used as the main listing photo. Use clear, bright
                images on white backgrounds for best approval chances.
              </p>
            </CardContent>
          </Card>

          {/* Shipping */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">🚚 Shipping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Handling Time" error={errors.handling_time?.message}>
                <Select
                  value={watch("handling_time")}
                  onValueChange={(v) =>
                    setValue("handling_time", v, { shouldValidate: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HANDLING_TIMES.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Ships From" error={errors.ships_from?.message}>
                <Input
                  {...register("ships_from")}
                  placeholder="Lagos, Nigeria"
                />
              </Field>

              <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="free-shipping" className="cursor-pointer">
                    Free shipping eligible
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Show a free shipping badge on this product.
                  </p>
                </div>
                <Switch
                  id="free-shipping"
                  checked={freeShipping}
                  onCheckedChange={(v) => setValue("free_shipping", v)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Submission rules */}
          <Card className="border-yellow-300 bg-yellow-50">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-bold">⚠️ Submission Rules</p>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                <li>Accurate product descriptions required</li>
                <li>At least 1 clear product image</li>
                <li>No counterfeit or prohibited items</li>
                <li>Correct category selection</li>
                <li>Realistic pricing (no price inflation)</li>
                <li>Stock must be available before listing</li>
              </ul>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitting ? "Submitting…" : "Submit for Admin Review →"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={submitting}
              onClick={() => navigate({ to: "/vendor/products" })}
            >
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </VendorShell>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
