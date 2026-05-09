-- =============================================================================
-- Audit trail for platform_settings
-- Records who changed each setting, what changed, and when.
-- Secret values are NEVER stored — only presence/length metadata.
-- =============================================================================

set search_path = public;

create table if not exists public.platform_settings_audit (
  id uuid primary key default gen_random_uuid(),
  setting_id uuid,
  key text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  is_secret boolean not null default false,
  -- For non-secret values we keep the actual old/new value.
  -- For secret values these stay null and we only record the *_present / *_length fields.
  old_value text,
  new_value text,
  old_value_present boolean not null default false,
  new_value_present boolean not null default false,
  old_value_length integer,
  new_value_length integer,
  changed_fields text[] not null default '{}',
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_platform_settings_audit_key on public.platform_settings_audit(key, changed_at desc);
create index if not exists idx_platform_settings_audit_changed_by on public.platform_settings_audit(changed_by);

alter table public.platform_settings_audit enable row level security;

create policy "Admins can select platform_settings_audit"
  on public.platform_settings_audit for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Audit trigger function
create or replace function public.log_platform_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_old text;
  v_new text;
  v_secret boolean;
  v_changed text[] := '{}';
begin
  if (tg_op = 'INSERT') then
    v_action := 'insert';
    v_secret := new.is_secret;
    v_new := case when v_secret then null else new.value end;
    insert into public.platform_settings_audit (
      setting_id, key, action, is_secret,
      old_value, new_value,
      old_value_present, new_value_present,
      old_value_length, new_value_length,
      changed_fields, changed_by
    ) values (
      new.id, new.key, v_action, v_secret,
      null, v_new,
      false, coalesce(length(new.value), 0) > 0,
      null, length(coalesce(new.value, '')),
      array['value','label','description','category','is_secret'],
      auth.uid()
    );
    return new;

  elsif (tg_op = 'UPDATE') then
    v_action := 'update';
    v_secret := new.is_secret or old.is_secret;
    if old.value is distinct from new.value then v_changed := array_append(v_changed, 'value'); end if;
    if old.label is distinct from new.label then v_changed := array_append(v_changed, 'label'); end if;
    if old.description is distinct from new.description then v_changed := array_append(v_changed, 'description'); end if;
    if old.category is distinct from new.category then v_changed := array_append(v_changed, 'category'); end if;
    if old.is_secret is distinct from new.is_secret then v_changed := array_append(v_changed, 'is_secret'); end if;
    if array_length(v_changed, 1) is null then return new; end if;

    v_old := case when v_secret then null else old.value end;
    v_new := case when v_secret then null else new.value end;

    insert into public.platform_settings_audit (
      setting_id, key, action, is_secret,
      old_value, new_value,
      old_value_present, new_value_present,
      old_value_length, new_value_length,
      changed_fields, changed_by
    ) values (
      new.id, new.key, v_action, v_secret,
      v_old, v_new,
      coalesce(length(old.value), 0) > 0, coalesce(length(new.value), 0) > 0,
      length(coalesce(old.value, '')), length(coalesce(new.value, '')),
      v_changed, auth.uid()
    );
    return new;

  elsif (tg_op = 'DELETE') then
    v_secret := old.is_secret;
    insert into public.platform_settings_audit (
      setting_id, key, action, is_secret,
      old_value, new_value,
      old_value_present, new_value_present,
      old_value_length, new_value_length,
      changed_fields, changed_by
    ) values (
      old.id, old.key, 'delete', v_secret,
      case when v_secret then null else old.value end, null,
      coalesce(length(old.value), 0) > 0, false,
      length(coalesce(old.value, '')), null,
      array['*deleted*'], auth.uid()
    );
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_platform_settings_audit on public.platform_settings;
create trigger trg_platform_settings_audit
after insert or update or delete on public.platform_settings
for each row execute function public.log_platform_settings_change();
