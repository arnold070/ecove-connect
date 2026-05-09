import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { invalidatePlatformValue } from "./platform-settings.server";

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

export interface PlatformSettingAuditEntry {
  id: string;
  setting_id: string | null;
  key: string;
  action: "insert" | "update" | "delete";
  is_secret: boolean;
  old_value: string | null;
  new_value: string | null;
  old_value_present: boolean;
  new_value_present: boolean;
  old_value_length: number | null;
  new_value_length: number | null;
  changed_fields: string[];
  changed_by: string | null;
  changed_at: string;
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

export const getPlatformSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data, error } = await supabase
      .from("platform_settings")
      .select("*")
      .order("category")
      .order("label");

    if (error) throw new Error(error.message);

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
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: row, error } = await supabase
      .from("platform_settings")
      .update({ value: data.value })
      .eq("id", data.id)
      .select("key")
      .single();

    if (error) throw new Error(error.message);
    if (row?.key) invalidatePlatformValue(row.key);
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
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

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

const auditSchema = z.object({
  key: z.string().max(100).optional(),
  limit: z.number().min(1).max(200).optional(),
});

export const getPlatformAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => auditSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    let q = supabase
      .from("platform_settings_audit")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.key) q = q.eq("key", data.key);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Defensive: never expose actual value text for secret rows.
    const entries = (rows as PlatformSettingAuditEntry[]).map((r) => ({
      ...r,
      old_value: r.is_secret ? null : r.old_value,
      new_value: r.is_secret ? null : r.new_value,
    }));
    return { entries };
  });
