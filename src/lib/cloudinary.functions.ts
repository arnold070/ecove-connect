/**
 * Cloudinary signed-upload server function.
 * Reads cloud_name / api_key / api_secret from platform_settings at runtime
 * (so admins can rotate keys via the dashboard without redeploying).
 *
 * The client uses the returned signature to upload images directly to
 * Cloudinary, which then returns a hosted URL + public_id we persist on
 * product_images. Eager transformations resize images automatically.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPlatformValue } from "./platform-settings.server";

export interface CloudinarySignaturePayload {
  cloud_name: string;
  api_key: string;
  timestamp: number;
  folder: string;
  signature: string;
  eager: string;
  upload_url: string;
}

const inputSchema = z.object({
  product_id: z.string().uuid().optional(),
});

// alphabetically sorted "k=v&k=v..." then sha1 with secret appended
function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== "" && params[k] !== undefined && params[k] !== null)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(toSign + apiSecret).digest("hex");
}

export const getCloudinaryUploadSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Caller must own a vendor profile (any status) or be admin
    const { data: vendor } = await supabase
      .from("vendors")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (!vendor) {
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      if (!isAdmin) throw new Error("Vendor profile required to upload images");
    }

    const [cloudName, apiKey, apiSecret, baseFolder] = await Promise.all([
      getPlatformValue("CLOUDINARY_CLOUD_NAME"),
      getPlatformValue("CLOUDINARY_API_KEY"),
      getPlatformValue("CLOUDINARY_API_SECRET"),
      getPlatformValue("CLOUDINARY_UPLOAD_FOLDER"),
    ]);

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        "Cloudinary not configured. Ask an admin to set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in platform settings.",
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = [baseFolder || "ecove/products", vendor?.id ?? "admin", data.product_id ?? "draft"]
      .filter(Boolean)
      .join("/");

    // eager transformations → resized variants are generated upfront
    const eager = "c_fill,w_400,h_400,q_auto,f_auto|c_fill,w_800,h_800,q_auto,f_auto|c_limit,w_1600,q_auto,f_auto";

    const signature = signParams(
      { timestamp, folder, eager, eager_async: "true" },
      apiSecret,
    );

    const payload: CloudinarySignaturePayload = {
      cloud_name: cloudName,
      api_key: apiKey,
      timestamp,
      folder,
      signature,
      eager,
      upload_url: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    };
    return payload;
  });

// ---------------------------------------------------------------------------
// testCloudinary — admin-only health check (used in /vendor/settings)
// ---------------------------------------------------------------------------
export const testCloudinary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const [cloudName, apiKey, apiSecret] = await Promise.all([
      getPlatformValue("CLOUDINARY_CLOUD_NAME"),
      getPlatformValue("CLOUDINARY_API_KEY"),
      getPlatformValue("CLOUDINARY_API_SECRET"),
    ]);
    if (!cloudName || !apiKey || !apiSecret) {
      return { ok: false, message: "Missing Cloudinary credentials" };
    }
    // ping account endpoint — basic auth with api_key:api_secret
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/usage`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) {
        return { ok: false, message: `Cloudinary returned ${res.status}` };
      }
      return { ok: true, message: "Cloudinary credentials are valid" };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  });
