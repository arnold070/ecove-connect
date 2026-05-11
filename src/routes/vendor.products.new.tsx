import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ImagePlus,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  GripVertical,
  Search,
  Check,
  ChevronsUpDown,
  Send,
  Save,
} from "lucide-react";

import { VendorShell } from "@/components/vendor-shell";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { nairaToKobo } from "@/lib/currency";
import {
  listCategories,
  createProduct,
  addProductImage,
  reorderProductImages,
  deleteProductImage,
  addProductVariant,
  submitProductForReview,
  type CategoryNode,
  type ProductImage,
} from "@/lib/products.functions";
import { getCloudinaryUploadSignature } from "@/lib/cloudinary.functions";

export const Route = createFileRoute("/vendor/products/new")({
  component: NewProductPage,
  head: () => ({
    meta: [{ title: "Add new product — Vendor — ecove" }],
  }),
});

const variantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().max(80).optional().or(z.literal("")),
  price_naira: z.coerce.number().min(0).optional(),
  stock: z.coerce.number().int().min(0),
  attributes: z.string().trim().max(200).optional().or(z.literal("")),
});

const productSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(20).max(8000),
  category_id: z.string().uuid({ message: "Pick a top-level category" }),
  subcategory_id: z.string().uuid().optional().or(z.literal("")),
  price_naira: z.coerce.number().positive("Price must be greater than 0"),
  compare_at_naira: z.coerce.number().min(0).optional().or(z.literal("")),
  stock: z.coerce.number().int().min(0),
  sku: z.string().trim().max(80).optional().or(z.literal("")),
  weight_kg: z.coerce.number().min(0).optional().or(z.literal("")),
  variants: z.array(variantSchema),
});

type ProductFormValues = z.infer<typeof productSchema>;

const MAX_IMAGES = 10;
const MAX_BYTES = 8 * 1024 * 1024;

// ---------------------------------------------------------------------------

function NewProductPage() {
  const { user, loading: authLoading, hasRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) void navigate({ to: "/login" });
  }, [authLoading, user, navigate]);

  if (authLoading || !user) {
    return (
      <VendorShell title="Add new product" subtitle="Loading…">
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      </VendorShell>
    );
  }

  if (!hasRole("vendor") && !hasRole("admin")) {
    return (
      <VendorShell title="Add new product" subtitle="Vendor access required">
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
          <CardContent className="flex items-start gap-3 p-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div className="space-y-2">
              <p className="font-medium">
                Your vendor account is not approved yet.
              </p>
              <p className="text-sm text-muted-foreground">
                Complete onboarding & KYC. Once an admin approves your store,
                you can list products.
              </p>
              <Button asChild size="sm">
                <Link to="/vendor/onboarding">Go to onboarding</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </VendorShell>
    );
  }

  return <NewProductForm />;
}

function NewProductForm() {
  const navigate = useNavigate();
  const fetchCats = useServerFn(listCategories);
  const create = useServerFn(createProduct);
  const addImage = useServerFn(addProductImage);
  const reorder = useServerFn(reorderProductImages);
  const removeImage = useServerFn(deleteProductImage);
  const addVariant = useServerFn(addProductVariant);
  const submit = useServerFn(submitProductForReview);
  const getSig = useServerFn(getCloudinaryUploadSignature);

  const { data: catData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => fetchCats(),
  });
  const tree = catData?.tree ?? [];

  const [productId, setProductId] = useState<string | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [uploading, setUploading] = useState(false);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      title: "",
      description: "",
      category_id: "",
      subcategory_id: "",
      price_naira: 0,
      compare_at_naira: "" as unknown as number,
      stock: 0,
      sku: "",
      weight_kg: "" as unknown as number,
      variants: [],
    },
  });

  const { register, handleSubmit, control, watch, setValue, formState } = form;
  const variants = useFieldArray({ control, name: "variants" });
  const categoryId = watch("category_id");

  const subcategoryOptions = useMemo<CategoryNode[]>(() => {
    return tree.find((c) => c.id === categoryId)?.children ?? [];
  }, [tree, categoryId]);

  // ---------- create draft on first save ----------
  const createMut = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const compareAtKobo =
        values.compare_at_naira === "" || Number(values.compare_at_naira) === 0
          ? null
          : nairaToKobo(Number(values.compare_at_naira));
      const weightGrams =
        values.weight_kg === "" ? null : Math.round(Number(values.weight_kg) * 1000);

      return create({
        data: {
          title: values.title,
          description: values.description,
          price_kobo: nairaToKobo(Number(values.price_naira)),
          compare_at_kobo: compareAtKobo,
          stock: Number(values.stock),
          sku: values.sku || null,
          weight_grams: weightGrams,
          category_id: values.subcategory_id || values.category_id,
          subcategory_id: values.subcategory_id || null,
        },
      });
    },
    onSuccess: async (res, values) => {
      setProductId(res.productId);
      // Persist any variants entered before save
      for (const v of values.variants) {
        await addVariant({
          data: {
            product_id: res.productId,
            name: v.name,
            sku: v.sku || null,
            price_kobo:
              v.price_naira === undefined || Number(v.price_naira) === 0
                ? null
                : nairaToKobo(Number(v.price_naira)),
            stock: Number(v.stock),
            attributes: parseAttributes(v.attributes ?? ""),
          },
        });
      }
      toast.success("Draft saved. Now add images and submit for review.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitMut = useMutation({
    mutationFn: () => submit({ data: { id: productId! } }),
    onSuccess: () => {
      toast.success("Product submitted for admin review");
      void navigate({ to: "/vendor/products/pending" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSubmit: SubmitHandler<ProductFormValues> = (v) => createMut.mutate(v);

  // ---------- Cloudinary upload ----------
  async function handleFiles(files: FileList | null) {
    if (!files || !productId) return;
    setUploading(true);
    try {
      const sig = await getSig({ data: { product_id: productId } });
      const remaining = MAX_IMAGES - images.length;
      const list = Array.from(files).slice(0, remaining);
      for (const file of list) {
        if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) {
          toast.error(`${file.name}: only JPG/PNG/WEBP/AVIF`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: must be ≤ 8MB`);
          continue;
        }
        const fd = new FormData();
        fd.append("file", file);
        fd.append("api_key", sig.api_key);
        fd.append("timestamp", String(sig.timestamp));
        fd.append("folder", sig.folder);
        fd.append("eager", sig.eager);
        fd.append("eager_async", "true");
        fd.append("signature", sig.signature);

        const res = await fetch(sig.upload_url, { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.text().catch(() => res.statusText);
          throw new Error(`Cloudinary upload failed: ${err}`);
        }
        const json = (await res.json()) as {
          secure_url: string;
          public_id: string;
          width: number;
          height: number;
        };
        const row = await addImage({
          data: {
            product_id: productId,
            url: json.secure_url,
            cloudinary_public_id: json.public_id,
            width: json.width,
            height: json.height,
            alt: file.name,
          },
        });
        setImages((prev) => [...prev, row]);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function deleteImg(id: string) {
    await removeImage({ data: { id } });
    setImages((prev) => prev.filter((i) => i.id !== id));
  }

  // ---------- Drag & drop reordering ----------
  const dragId = useRef<string | null>(null);
  function onDragStart(id: string) {
    dragId.current = id;
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  async function onDrop(targetId: string) {
    const src = dragId.current;
    dragId.current = null;
    if (!src || src === targetId || !productId) return;
    const next = [...images];
    const srcIdx = next.findIndex((i) => i.id === src);
    const tgtIdx = next.findIndex((i) => i.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;
    const [moved] = next.splice(srcIdx, 1);
    next.splice(tgtIdx, 0, moved);
    setImages(next);
    await reorder({
      data: { product_id: productId, order: next.map((i) => i.id) },
    });
  }

  return (
    <VendorShell
      title="Add new product"
      subtitle={
        productId
          ? "Step 2 of 2 — Upload images, then submit for review"
          : "Step 1 of 2 — Enter product details, then save as draft"
      }
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid gap-6 lg:grid-cols-3"
      >
        {/* LEFT: details + variants */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basic info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Product title" error={formState.errors.title?.message}>
                <Input
                  {...register("title")}
                  placeholder="Samsung Galaxy A55 5G 256GB"
                  disabled={!!productId}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Category"
                  error={formState.errors.category_id?.message}
                >
                  <CategoryPicker
                    value={watch("category_id")}
                    onChange={(v) => {
                      setValue("category_id", v, { shouldValidate: true });
                      setValue("subcategory_id", "");
                    }}
                    options={tree}
                    placeholder="Select top-level category"
                    disabled={!!productId}
                  />
                </Field>
                <Field label="Subcategory">
                  <CategoryPicker
                    value={watch("subcategory_id") || ""}
                    onChange={(v) =>
                      setValue("subcategory_id", v, { shouldValidate: true })
                    }
                    options={subcategoryOptions}
                    placeholder={
                      subcategoryOptions.length
                        ? "Select subcategory"
                        : "Pick a category first"
                    }
                    disabled={!subcategoryOptions.length || !!productId}
                  />
                </Field>
              </div>

              <Field
                label="Description"
                error={formState.errors.description?.message}
              >
                <Textarea
                  rows={6}
                  {...register("description")}
                  placeholder="Detailed description, features, materials, what's in the box…"
                  disabled={!!productId}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pricing & inventory</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Price (₦)"
                error={formState.errors.price_naira?.message}
              >
                <Input
                  type="number"
                  step="any"
                  {...register("price_naira")}
                  disabled={!!productId}
                />
              </Field>
              <Field label="Compare-at price (₦)">
                <Input
                  type="number"
                  step="any"
                  {...register("compare_at_naira")}
                  placeholder="Optional"
                  disabled={!!productId}
                />
              </Field>
              <Field
                label="Stock"
                error={formState.errors.stock?.message}
              >
                <Input
                  type="number"
                  {...register("stock")}
                  disabled={!!productId}
                />
              </Field>
              <Field label="SKU">
                <Input {...register("sku")} disabled={!!productId} />
              </Field>
              <Field label="Weight (kg)">
                <Input
                  type="number"
                  step="any"
                  {...register("weight_kg")}
                  disabled={!!productId}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Variants (optional)</CardTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  variants.append({
                    name: "",
                    sku: "",
                    price_naira: 0,
                    stock: 0,
                    attributes: "",
                  })
                }
                disabled={!!productId}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add variant
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {variants.fields.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Add SKU-level variants if your product has multiple sizes,
                  colors, etc. Each variant has its own price, stock, and SKU.
                </p>
              ) : null}
              {variants.fields.map((f, idx) => (
                <div
                  key={f.id}
                  className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3 sm:grid-cols-[1.4fr_1fr_1fr_0.8fr_1.2fr_auto]"
                >
                  <Input
                    {...register(`variants.${idx}.name`)}
                    placeholder="Variant name (e.g. Black / Large)"
                    disabled={!!productId}
                  />
                  <Input
                    {...register(`variants.${idx}.sku`)}
                    placeholder="SKU"
                    disabled={!!productId}
                  />
                  <Input
                    type="number"
                    step="any"
                    {...register(`variants.${idx}.price_naira`)}
                    placeholder="Price ₦"
                    disabled={!!productId}
                  />
                  <Input
                    type="number"
                    {...register(`variants.${idx}.stock`)}
                    placeholder="Stock"
                    disabled={!!productId}
                  />
                  <Input
                    {...register(`variants.${idx}.attributes`)}
                    placeholder="color=Black,size=L"
                    disabled={!!productId}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => variants.remove(idx)}
                    disabled={!!productId}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: images + actions */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Images</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!productId ? (
                <p className="text-xs text-muted-foreground">
                  Save the draft first, then upload images here. They&apos;ll
                  be stored on Cloudinary with auto-resizing.
                </p>
              ) : (
                <>
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground transition hover:border-primary">
                    <ImagePlus className="h-6 w-6" />
                    <span className="font-medium text-foreground">
                      {uploading ? "Uploading…" : "Click to add images"}
                    </span>
                    <span className="text-[11px]">
                      JPG, PNG, WEBP up to 8 MB · max {MAX_IMAGES} images
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      multiple
                      className="hidden"
                      onChange={(e) => void handleFiles(e.target.files)}
                      disabled={uploading || images.length >= MAX_IMAGES}
                    />
                  </label>

                  <div className="grid grid-cols-3 gap-2">
                    {images.map((img, idx) => (
                      <div
                        key={img.id}
                        draggable
                        onDragStart={() => onDragStart(img.id)}
                        onDragOver={onDragOver}
                        onDrop={() => void onDrop(img.id)}
                        className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
                      >
                        <img
                          src={img.url}
                          alt={img.alt ?? ""}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                        <span className="absolute left-1 top-1 rounded bg-foreground/70 px-1.5 py-0.5 text-[10px] font-bold text-background">
                          {idx === 0 ? "Primary" : idx + 1}
                        </span>
                        <span className="absolute right-1 top-1 rounded bg-foreground/70 p-1 text-background opacity-0 transition group-hover:opacity-100">
                          <GripVertical className="h-3 w-3" />
                        </span>
                        <button
                          type="button"
                          onClick={() => void deleteImg(img.id)}
                          className="absolute bottom-1 right-1 rounded bg-destructive p-1 text-destructive-foreground opacity-0 transition group-hover:opacity-100"
                          aria-label="Delete image"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {images.length > 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Drag thumbnails to reorder. First image is the primary.
                    </p>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant={productId ? "secondary" : "outline"}>
                  {productId ? "draft" : "not saved"}
                </Badge>
                {images.length > 0 ? (
                  <Badge variant="outline">{images.length} image(s)</Badge>
                ) : null}
              </div>
              {!productId ? (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createMut.isPending}
                >
                  {createMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save draft
                </Button>
              ) : (
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => submitMut.mutate()}
                  disabled={submitMut.isPending || images.length === 0}
                >
                  {submitMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Submit for review
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </form>
    </VendorShell>
  );
}

// ---------------------------------------------------------------------------

function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

function CategoryPicker({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: CategoryNode[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                <span>{selected.icon ?? "•"}</span>
                {selected.name}
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <CommandInput placeholder="Search…" className="h-9" />
          </div>
          <CommandList>
            <CommandEmpty>No category found</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.name} ${o.slug}`}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === o.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="mr-2">{o.icon ?? "•"}</span>
                  {o.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function parseAttributes(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s) return out;
  for (const part of s.split(",")) {
    const [k, v] = part.split("=").map((x) => x?.trim());
    if (k && v) out[k] = v;
  }
  return out;
}
