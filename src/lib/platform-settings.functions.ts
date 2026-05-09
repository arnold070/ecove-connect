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
  action: z.enum(["insert", "update", "delete"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.number().int().min(1).max(10000).optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildAuditQuery(supabase: any, data: z.infer<typeof auditSchema>) {
  let q = supabase.from("platform_settings_audit").select("*", { count: "exact" });
  if (data.key) q = q.eq("key", data.key);
  if (data.action) q = q.eq("action", data.action);
  if (data.from) q = q.gte("changed_at", data.from);
  if (data.to) q = q.lte("changed_at", data.to);
  return q.order("changed_at", { ascending: false });
}

export const getPlatformAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => auditSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const pageSize = data.pageSize ?? 25;
    const page = data.page ?? 1;
    const fromIdx = (page - 1) * pageSize;
    const toIdx = fromIdx + pageSize - 1;

    const q = await buildAuditQuery(supabase, data);
    const { data: rows, count, error } = await q.range(fromIdx, toIdx);
    if (error) throw new Error(error.message);

    const entries = (rows as PlatformSettingAuditEntry[]).map((r) => ({
      ...r,
      old_value: r.is_secret ? null : r.old_value,
      new_value: r.is_secret ? null : r.new_value,
    }));
    return { entries, total: count ?? entries.length, page, pageSize };
  });

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const exportPlatformAuditCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => auditSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const q = await buildAuditQuery(supabase, data);
    const { data: rows, error } = await q.limit(10000);
    if (error) throw new Error(error.message);

    const headers = [
      "changed_at","key","action","is_secret","changed_by",
      "changed_fields","old_value","new_value","old_value_length","new_value_length",
    ];
    const lines = [headers.join(",")];
    for (const r of rows as PlatformSettingAuditEntry[]) {
      lines.push([
        r.changed_at,
        r.key,
        r.action,
        r.is_secret,
        r.changed_by ?? "",
        (r.changed_fields ?? []).join("|"),
        r.is_secret ? "***MASKED***" : (r.old_value ?? ""),
        r.is_secret ? "***MASKED***" : (r.new_value ?? ""),
        r.old_value_length ?? "",
        r.new_value_length ?? "",
      ].map(csvEscape).join(","));
    }
    return { csv: lines.join("\n"), count: rows?.length ?? 0 };
  });

