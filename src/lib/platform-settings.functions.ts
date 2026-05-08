import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PlatformSetting {
  id: string;
  key: string;
  value: string;
  label: string;
  description: string | null;
  category: string;
  is_secret: boolean;
  updated_at: string;
}

export const getPlatformSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const { data, error } = await supabase
      .from("platform_settings")
      .select("*")
      .order("category")
      .order("label");

    if (error) throw new Error(error.message);

    // Mask secret values for display
    const settings = (data as PlatformSetting[]).map((s) => ({
      ...s,
      value: s.is_secret && s.value ? "••••••••" : s.value,
    }));

    return { settings };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  value: z.string().max(2000),
});

export const updatePlatformSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { error } = await supabase
      .from("platform_settings")
      .update({ value: data.value })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });

const addKeySchema = z.object({
  key: z.string().min(1).max(100).regex(/^[A-Z][A-Z0-9_]*$/),
  label: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  category: z.string().min(1).max(50),
  is_secret: z.boolean(),
});

export const addPlatformSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => addKeySchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { error } = await supabase.from("platform_settings").insert({
      key: data.key,
      label: data.label,
      description: data.description ?? null,
      category: data.category,
      is_secret: data.is_secret,
      value: "",
    });

    if (error) throw new Error(error.message);
    return { success: true };
  });
