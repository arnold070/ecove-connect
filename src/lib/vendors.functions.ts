/**
 * Vendor onboarding & KYC server functions.
 * Owner-scoped via requireSupabaseAuth (RLS applies).
 * Admin-only functions assert role explicitly.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "@/lib/slug";

export type VendorStatus = "draft" | "pending" | "approved" | "rejected" | "suspended";
export type KycDocType =
  | "id_front"
  | "id_back"
  | "business_reg"
  | "tax_cert"
  | "address_proof"
  | "other";
export type KycDocStatus = "pending" | "approved" | "rejected";

export interface VendorRow {
  id: string;
  owner_id: string;
  store_name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  status: VendorStatus;
  business_registration_number: string | null;
  tax_id: string | null;
  country: string;
  city: string | null;
  business_address: string | null;
  contact_email: string | null;
  whatsapp: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface KycDocumentRow {
  id: string;
  vendor_id: string;
  doc_type: KycDocType;
  storage_path: string;
  status: KycDocStatus;
  reviewer_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  signed_url?: string;
}

const KYC_BUCKET = "kyc-documents";
const SIGNED_URL_TTL = 60 * 10; // 10 min

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function signKycDocs(supabase: any, docs: KycDocumentRow[]) {
  const out: KycDocumentRow[] = [];
  for (const d of docs) {
    const { data } = await supabase.storage
      .from(KYC_BUCKET)
      .createSignedUrl(d.storage_path, SIGNED_URL_TTL);
    out.push({ ...d, signed_url: data?.signedUrl });
  }
  return out;
}

// ---------------------------------------------------------------------------
// getMyVendor
// ---------------------------------------------------------------------------
export const getMyVendor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: vendor, error } = await supabase
      .from("vendors")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!vendor) return { vendor: null, documents: [] as KycDocumentRow[] };

    const { data: docs, error: docsErr } = await supabase
      .from("vendor_kyc_documents")
      .select("*")
      .eq("vendor_id", vendor.id)
      .order("created_at", { ascending: false });
    if (docsErr) throw new Error(docsErr.message);

    const signed = await signKycDocs(supabase, (docs ?? []) as KycDocumentRow[]);
    return { vendor: vendor as VendorRow, documents: signed };
  });

// ---------------------------------------------------------------------------
// upsertVendorDraft  — create or update the draft profile
// ---------------------------------------------------------------------------
const draftSchema = z.object({
  store_name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  business_registration_number: z.string().trim().max(80).optional().nullable(),
  tax_id: z.string().trim().max(80).optional().nullable(),
  country: z.string().trim().min(2).max(80),
  city: z.string().trim().max(120).optional().nullable(),
  business_address: z.string().trim().max(500).optional().nullable(),
  contact_email: z.string().trim().email().max(255).optional().nullable().or(z.literal("")),
  whatsapp: z.string().trim().max(40).optional().nullable(),
});

export const upsertVendorDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => draftSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("vendors")
      .select("id, slug, status")
      .eq("owner_id", userId)
      .maybeSingle();

    const payload = {
      store_name: data.store_name,
      description: data.description ?? null,
      business_registration_number: data.business_registration_number ?? null,
      tax_id: data.tax_id ?? null,
      country: data.country,
      city: data.city ?? null,
      business_address: data.business_address ?? null,
      contact_email: data.contact_email || null,
      whatsapp: data.whatsapp ?? null,
    };

    if (existing) {
      // approved vendors can update profile but not via draft path
      if (existing.status !== "draft" && existing.status !== "rejected") {
        // allow editing core profile while approved/pending — but keep status
        const { error } = await supabase
          .from("vendors")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        return { vendorId: existing.id as string, status: existing.status as VendorStatus };
      }
      const { error } = await supabase
        .from("vendors")
        .update({ ...payload, status: "draft", rejection_reason: null })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { vendorId: existing.id as string, status: "draft" as VendorStatus };
    }

    // generate a unique slug
    const base = slugify(data.store_name) || "vendor";
    let slug = base;
    for (let i = 0; i < 5; i++) {
      const { data: clash } = await supabase
        .from("vendors")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!clash) break;
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const { data: created, error } = await supabase
      .from("vendors")
      .insert({ ...payload, owner_id: userId, slug, status: "draft" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { vendorId: created.id as string, status: "draft" as VendorStatus };
  });

// ---------------------------------------------------------------------------
// createKycUploadUrl — returns a signed upload URL the client can PUT to
// ---------------------------------------------------------------------------
const uploadSchema = z.object({
  vendor_id: z.string().uuid(),
  doc_type: z.enum(["id_front", "id_back", "business_reg", "tax_cert", "address_proof", "other"]),
  filename: z.string().min(1).max(200),
  content_type: z.string().min(1).max(120),
});

export const createKycUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => uploadSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // verify the vendor belongs to the user
    const { data: v, error: vErr } = await supabase
      .from("vendors")
      .select("id, owner_id")
      .eq("id", data.vendor_id)
      .maybeSingle();
    if (vErr) throw new Error(vErr.message);
    if (!v || v.owner_id !== userId) throw new Error("Vendor not found");

    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = `${userId}/${data.vendor_id}/${data.doc_type}-${Date.now()}-${safeName}`;

    const { data: signed, error } = await supabase.storage
      .from(KYC_BUCKET)
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);

    return { uploadUrl: signed.signedUrl, token: signed.token, path };
  });

// ---------------------------------------------------------------------------
// recordKycDocument — after client uploads, persist DB row
// ---------------------------------------------------------------------------
const recordSchema = z.object({
  vendor_id: z.string().uuid(),
  doc_type: z.enum(["id_front", "id_back", "business_reg", "tax_cert", "address_proof", "other"]),
  storage_path: z.string().min(1).max(500),
});

export const recordKycDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recordSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("vendor_kyc_documents").insert({
      vendor_id: data.vendor_id,
      doc_type: data.doc_type,
      storage_path: data.storage_path,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ---------------------------------------------------------------------------
// deleteKycDocument
// ---------------------------------------------------------------------------
export const deleteKycDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc } = await supabase
      .from("vendor_kyc_documents")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (doc?.storage_path) {
      await supabase.storage.from(KYC_BUCKET).remove([doc.storage_path]);
    }
    const { error } = await supabase.from("vendor_kyc_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

// ---------------------------------------------------------------------------
// submitVendorForReview
// ---------------------------------------------------------------------------
export const submitVendorForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: vendor, error: vErr } = await supabase
      .from("vendors")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();
    if (vErr) throw new Error(vErr.message);
    if (!vendor) throw new Error("No vendor profile found. Create one first.");
    if (!["draft", "rejected"].includes(vendor.status)) {
      throw new Error(`Cannot submit: status is '${vendor.status}'`);
    }

    const { count } = await supabase
      .from("vendor_kyc_documents")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", vendor.id);
    if (!count || count < 2) {
      throw new Error("Upload at least 2 KYC documents before submitting.");
    }

    const { error } = await supabase
      .from("vendors")
      .update({
        status: "pending",
        submitted_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", vendor.id);
    if (error) throw new Error(error.message);

    await supabase.from("vendor_onboarding_audit").insert({
      vendor_id: vendor.id,
      action: "submit",
      actor_id: userId,
    });
    return { success: true };
  });

// ---------------------------------------------------------------------------
// ADMIN: list pending vendors
// ---------------------------------------------------------------------------
const listSchema = z.object({
  status: z.enum(["draft", "pending", "approved", "rejected", "suspended"]).optional(),
  page: z.number().int().min(1).max(10000).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const listVendorsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const status = data.status ?? "pending";
    const pageSize = data.pageSize ?? 25;
    const page = data.page ?? 1;
    const from = (page - 1) * pageSize;

    const { data: rows, count, error } = await supabase
      .from("vendors")
      .select("*", { count: "exact" })
      .eq("status", status)
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return { vendors: (rows ?? []) as VendorRow[], total: count ?? 0, page, pageSize };
  });

// ---------------------------------------------------------------------------
// ADMIN: get one vendor with documents (signed URLs)
// ---------------------------------------------------------------------------
export const getVendorAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: vendor, error } = await supabase
      .from("vendors")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: docs } = await supabase
      .from("vendor_kyc_documents")
      .select("*")
      .eq("vendor_id", data.id)
      .order("created_at", { ascending: false });
    const signed = await signKycDocs(supabase, (docs ?? []) as KycDocumentRow[]);
    const { data: audit } = await supabase
      .from("vendor_onboarding_audit")
      .select("*")
      .eq("vendor_id", data.id)
      .order("created_at", { ascending: false });
    return { vendor: vendor as VendorRow, documents: signed, audit: audit ?? [] };
  });

// ---------------------------------------------------------------------------
// ADMIN: approve / reject
// ---------------------------------------------------------------------------
export const approveVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: v, error } = await supabase
      .from("vendors")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: userId,
        rejection_reason: null,
      })
      .eq("id", data.id)
      .select("owner_id")
      .single();
    if (error) throw new Error(error.message);

    // grant 'vendor' role if missing (admin via RLS user_roles policy)
    if (v?.owner_id) {
      await supabase
        .from("user_roles")
        .upsert(
          { user_id: v.owner_id, role: "vendor" },
          { onConflict: "user_id,role", ignoreDuplicates: true },
        );
    }

    await supabase.from("vendor_onboarding_audit").insert({
      vendor_id: data.id,
      action: "approve",
      note: data.note ?? null,
      actor_id: userId,
    });
    return { success: true };
  });

export const rejectVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(500) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { error } = await supabase
      .from("vendors")
      .update({ status: "rejected", rejection_reason: data.reason })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabase.from("vendor_onboarding_audit").insert({
      vendor_id: data.id,
      action: "reject",
      note: data.reason,
      actor_id: userId,
    });
    return { success: true };
  });
