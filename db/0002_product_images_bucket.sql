-- =============================================================================
-- Ecove — product-images storage bucket
-- File: db/0002_product_images_bucket.sql
-- =============================================================================

-- Public read bucket for product images.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Public read for everyone.
drop policy if exists "product-images public read" on storage.objects;
create policy "product-images public read" on storage.objects
  for select using (bucket_id = 'product-images');

-- Authenticated users may upload to a folder named after their auth uid.
drop policy if exists "product-images owner upload" on storage.objects;
create policy "product-images owner upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users may update/delete their own files.
drop policy if exists "product-images owner update" on storage.objects;
create policy "product-images owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "product-images owner delete" on storage.objects;
create policy "product-images owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
