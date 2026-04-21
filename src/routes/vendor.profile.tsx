import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { VendorShell } from "@/components/vendor-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/slug";

export const Route = createFileRoute("/vendor/profile")({
  component: VendorProfilePage,
});

const schema = z.object({
  store_name: z.string().trim().min(2, "Store name is required").max(80),
  slug: z
    .string()
    .trim()
    .min(3, "Slug must be at least 3 characters")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(20).optional().or(z.literal("")),
  payout_bank_name: z.string().trim().max(80).optional().or(z.literal("")),
  payout_account_name: z.string().trim().max(80).optional().or(z.literal("")),
  payout_account_number: z.string().trim().max(30).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

interface VendorRow {
  id: string;
  store_name: string;
  slug: string;
  description: string | null;
  whatsapp: string | null;
  payout_bank_name: string | null;
  payout_account_name: string | null;
  payout_account_number: string | null;
  status: string;
}

function VendorProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [vendor, setVendor] = useState<VendorRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      store_name: "",
      slug: "",
      description: "",
      whatsapp: "",
      payout_bank_name: "",
      payout_account_name: "",
      payout_account_number: "",
    },
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      void navigate({ to: "/login" });
      return;
    }
    let mounted = true;
    setLoadError(null);
    setLoading(true);
    void (async () => {
      const queryPromise = supabase
        .from("vendors")
        .select(
          "id, store_name, slug, description, whatsapp, payout_bank_name, payout_account_name, payout_account_number, status",
        )
        .eq("owner_id", user.id)
        .maybeSingle();

      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(
          () =>
            resolve({
              data: null,
              error: { message: "Vendor lookup timed out after 10s. Check your connection or RLS policies." },
            }),
          10000,
        ),
      );

      const { data, error } = (await Promise.race([queryPromise, timeoutPromise])) as {
        data: VendorRow | null;
        error: { message: string } | null;
      };
      if (!mounted) return;
      if (error) {
        setLoadError(error.message);
        toast.error(error.message);
      }
      if (data) {
        setVendor(data);
        form.reset({
          store_name: data.store_name ?? "",
          slug: data.slug ?? "",
          description: data.description ?? "",
          whatsapp: data.whatsapp ?? "",
          payout_bank_name: data.payout_bank_name ?? "",
          payout_account_name: data.payout_account_name ?? "",
          payout_account_number: data.payout_account_number ?? "",
        });
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [user, authLoading, navigate, form]);

  const onSubmit = async (values: FormValues) => {
    if (!user) return;
    setSubmitting(true);
    setSaveError(null);
    try {
      const payload = {
        owner_id: user.id,
        store_name: values.store_name,
        slug: values.slug,
        description: values.description || null,
        whatsapp: values.whatsapp || null,
        payout_bank_name: values.payout_bank_name || null,
        payout_account_name: values.payout_account_name || null,
        payout_account_number: values.payout_account_number || null,
      };

      if (vendor) {
        const { error } = await supabase
          .from("vendors")
          .update(payload)
          .eq("id", vendor.id);
        if (error) throw error;
        toast.success("Vendor profile updated");
      } else {
        const { error } = await supabase
          .from("vendors")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        toast.success("Vendor profile created — you can now list products");
        await supabase
          .from("user_roles")
          .insert({ user_id: user.id, role: "vendor" })
          .then(({ error: roleErr }) => {
            if (roleErr && !/duplicate|unique/i.test(roleErr.message)) {
              // eslint-disable-next-line no-console
              console.warn("[ecove] add vendor role:", roleErr.message);
            }
          });
        void navigate({ to: "/vendor/products/new" });
        return;
      }
    } catch (err) {
      const e = err as { message?: string; code?: string; details?: string; hint?: string };
      const parts = [
        e.message,
        e.code ? `code: ${e.code}` : null,
        e.details ? `details: ${e.details}` : null,
        e.hint ? `hint: ${e.hint}` : null,
      ].filter(Boolean);
      const msg = parts.join(" — ") || "Failed to save";
      setSaveError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const storeName = form.watch("store_name");
  const slugValue = form.watch("slug");
  // Auto-fill slug from store name while the slug field is untouched/empty.
  useEffect(() => {
    if (!vendor && storeName && !slugValue) {
      form.setValue("slug", slugify(storeName), { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeName]);

  return (
    <VendorShell
      title={vendor ? "Store Profile" : "Create your store"}
      subtitle={
        vendor
          ? "Update your store info and payout details"
          : "Set up your vendor profile before listing products"
      }
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p className="text-xs">Loading vendor profile…</p>
        </div>
      ) : loadError ? (
        <Alert variant="destructive" className="max-w-3xl">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load vendor profile</AlertTitle>
          <AlertDescription className="break-words">{loadError}</AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-3xl">
          {saveError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Save failed</AlertTitle>
              <AlertDescription className="break-words">{saveError}</AlertDescription>
            </Alert>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Store details</CardTitle>
              <CardDescription>Public information shown to shoppers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="store_name">Store name *</Label>
                <Input id="store_name" {...form.register("store_name")} />
                {form.formState.errors.store_name && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.store_name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Store URL slug *</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">ecove.com/store/</span>
                  <Input id="slug" {...form.register("slug")} className="flex-1" />
                </div>
                {form.formState.errors.slug && (
                  <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  rows={4}
                  placeholder="Tell customers what your store is about..."
                  {...form.register("description")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp contact</Label>
                <Input
                  id="whatsapp"
                  placeholder="+234..."
                  {...form.register("whatsapp")}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payout / Bank details</CardTitle>
              <CardDescription>
                Used for remitting your earnings. Kept private.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="payout_bank_name">Bank name</Label>
                  <Input id="payout_bank_name" {...form.register("payout_bank_name")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payout_account_name">Account name</Label>
                  <Input id="payout_account_name" {...form.register("payout_account_name")} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payout_account_number">Account number</Label>
                <Input
                  id="payout_account_number"
                  inputMode="numeric"
                  {...form.register("payout_account_number")}
                />
              </div>
            </CardContent>
          </Card>

          {vendor && (
            <div className="text-sm text-muted-foreground">
              Status:{" "}
              <span className="font-medium capitalize text-foreground">{vendor.status}</span>
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {vendor ? "Save changes" : "Create store"}
            </Button>
            {vendor && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigate({ to: "/vendor" })}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
    </VendorShell>
  );
}
