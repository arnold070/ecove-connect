-- =============================================================================
-- Ecove — Branding (site logo) storage + setting
-- File: db/0012_branding.sql
--
-- 1. Adds a `branding` storage bucket (public read, admin-only write).
-- 2. Seeds a SITE_LOGO_URL row in platform_settings so admins can manage the
--    site logo from the dashboard.
-- =============================================================================

set search_path = public;

-- ----- 1. Storage bucket -----------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

-- Public read for everyone (so the storefront can render the logo).
drop policy if exists "branding public read" on storage.objects;
create policy "branding public read" on storage.objects
  for select using (bucket_id = 'branding');

-- Only admins can insert/update/delete in this bucket from the client.
-- (Server functions using the service role key bypass RLS — this is the
-- belt-and-braces gate for direct client uploads.)
drop policy if exists "branding admin insert" on storage.objects;
create policy "branding admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding' and public.has_role(auth.uid(), 'admin'));

drop policy if exists "branding admin update" on storage.objects;
create policy "branding admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'branding' and public.has_role(auth.uid(), 'admin'));

drop policy if exists "branding admin delete" on storage.objects;
create policy "branding admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and public.has_role(auth.uid(), 'admin'));

-- ----- 2. Platform setting row ----------------------------------------------
insert into public.platform_settings (key, label, description, category, is_secret)
values (
  'SITE_LOGO_URL',
  'Site Logo URL',
  'Public URL of the site logo shown in the storefront header. Upload from Admin → Settings → Branding.',
  'branding',
  false
)
on conflict (key) do nothing;
