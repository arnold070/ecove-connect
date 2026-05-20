/**
 * Branding — public site logo helpers.
 *
 * - `getPublicBranding` (unauthenticated) returns the site logo URL so the
 *   storefront header can render it on every page.
 * - `uploadSiteLogo` (admin-only) uploads a base64 image to the `branding`
 *   storage bucket and persists the public URL into `platform_settings`.
 *
 * SECURITY: the public reader uses the service-role admin client deliberately
 * (the SITE_LOGO_URL row is admin-RLS), but only ever returns a single
 * non-sensitive string. Never widen this to return arbitrary settings.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { invalidatePlatformValue } from "./platform-settings.server";

export interface PublicBranding {
  logoUrl: string | null;
}

export const getPublicBranding = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicBranding> => {
    try {
      const { data } = await supabaseAdmin
        .from("platform_settings")
        .select("value")
        .eq("key", "SITE_LOGO_URL")
        .maybeSingle();
      const value = ((data?.value as string | undefined) ?? "").trim();
      return { logoUrl: value || null };
    } catch {
      return { logoUrl: null };
    }
  },
);

const uploadSchema = z.object({
  // data URL: "data:image/png;base64,...."
  dataUrl: z
    .string()
    .min(20)
    .max(5_000_000) // ~5MB worth of base64
    .regex(/^data:image\/(png|jpe?g|webp|svg\+xml|gif);base64,/i, {
      message: "Must be a base64-encoded PNG/JPEG/WEBP/SVG/GIF",
    }),
  filename: z.string().min(1).max(120).optional(),
});

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("gif")) return "gif";
  return "bin";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const uploadSiteLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => uploadSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const match = /^data:([^;]+);base64,(.+)$/.exec(data.dataUrl);
    if (!match) throw new Error("Invalid image data");
    const mime = match[1]!;
    const base64 = match[2]!;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 3_500_000) {
      throw new Error("Image too large (max 3.5MB).");
    }

    const ext = extFromMime(mime);
    // Use a timestamped filename so CDNs/clients pick up the new version
    // without manual cache-busting.
    const path = `site/logo-${Date.now()}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("branding")
      .upload(path, bytes, {
        contentType: mime,
        upsert: true,
        cacheControl: "3600",
      });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: pub } = supabaseAdmin.storage
      .from("branding")
      .getPublicUrl(path);
    const url = pub.publicUrl;
    if (!url) throw new Error("Could not resolve public URL for logo.");

    const { error: updErr } = await supabaseAdmin
      .from("platform_settings")
      .update({ value: url })
      .eq("key", "SITE_LOGO_URL");
    if (updErr) throw new Error(`Saving setting failed: ${updErr.message}`);

    invalidatePlatformValue("SITE_LOGO_URL");
    return { url };
  });

export const clearSiteLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabaseAdmin
      .from("platform_settings")
      .update({ value: "" })
      .eq("key", "SITE_LOGO_URL");
    if (error) throw new Error(error.message);
    invalidatePlatformValue("SITE_LOGO_URL");
    return { ok: true };
  });
