-- =============================================================================
-- Products v2: extend image/variant metadata, add moderation audit + Cloudinary
-- platform settings. Enforce approved-only for cart/order item insertion.
-- File: db/0007_products_v2.sql
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- product_images: add Cloudinary metadata
-- ---------------------------------------------------------------------------
alter table public.product_images
  add column if not exists cloudinary_public_id text,
  add column if not exists width  int,
  add column if not exists height int,
  add column if not exists alt    text,
  add column if not exists is_primary boolean not null default false;

create index if not exists idx_product_images_position
  on public.product_images(product_id, position);

-- ---------------------------------------------------------------------------
-- product_variants: per-SKU pricing, attributes, ordering
-- ---------------------------------------------------------------------------
alter table public.product_variants
  add column if not exists attributes jsonb not null default '{}'::jsonb,
  add column if not exists position int not null default 0,
  add column if not exists compare_at_kobo bigint
    check (compare_at_kobo is null or compare_at_kobo >= 0);

-- ensure unique SKU per product when set
create unique index if not exists uq_product_variants_sku
  on public.product_variants(product_id, sku) where sku is not null;

-- ---------------------------------------------------------------------------
-- products: add submission/review timestamps, subcategory_id
-- (category_id already exists; subcategory is optional second level)
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists subcategory_id uuid references public.categories(id) on delete set null,
  add column if not exists submitted_at   timestamptz,
  add column if not exists reviewed_at    timestamptz,
  add column if not exists reviewed_by    uuid references auth.users(id) on delete set null;

create index if not exists idx_products_subcategory on public.products(subcategory_id);

-- New default for vendor-created products is 'draft'
alter table public.products alter column status set default 'draft';

-- Suspend status (admin can suspend an already-approved product)
do $$ begin
  alter type public.product_status add value if not exists 'suspended' after 'approved';
exception when others then null; end $$;

-- ---------------------------------------------------------------------------
-- product_moderation_audit
-- ---------------------------------------------------------------------------
create table if not exists public.product_moderation_audit (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  action      text not null check (action in
    ('submit','approve','reject','suspend','reinstate','archive','edit')),
  note        text,
  actor_id    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.product_moderation_audit enable row level security;
create index if not exists idx_product_mod_audit_product
  on public.product_moderation_audit(product_id);

drop policy if exists "product_mod_audit read" on public.product_moderation_audit;
create policy "product_mod_audit read" on public.product_moderation_audit
  for select to authenticated
  using (
    exists (
      select 1 from public.products p
      join public.vendors v on v.id = p.vendor_id
      where p.id = product_id and v.owner_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

drop policy if exists "product_mod_audit insert" on public.product_moderation_audit;
create policy "product_mod_audit insert" on public.product_moderation_audit
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and (
      exists (
        select 1 from public.products p
        join public.vendors v on v.id = p.vendor_id
        where p.id = product_id and v.owner_id = auth.uid()
      )
      or public.has_role(auth.uid(), 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Block cart_items + order_items for non-approved or out-of-stock products
-- ---------------------------------------------------------------------------
create or replace function public.assert_product_purchasable()
returns trigger language plpgsql as $$
declare
  v_status public.product_status;
  v_stock  int;
begin
  select status, stock into v_status, v_stock
    from public.products where id = new.product_id;
  if v_status is null then
    raise exception 'Product % not found', new.product_id;
  end if;
  if v_status <> 'approved' then
    raise exception 'Product is not available for purchase (status: %)', v_status;
  end if;
  if v_stock < new.quantity then
    raise exception 'Insufficient stock for product %', new.product_id;
  end if;
  return new;
end; $$;

drop trigger if exists trg_cart_items_purchasable on public.cart_items;
create trigger trg_cart_items_purchasable
before insert or update on public.cart_items
for each row execute function public.assert_product_purchasable();

drop trigger if exists trg_order_items_purchasable on public.order_items;
create trigger trg_order_items_purchasable
before insert on public.order_items
for each row execute function public.assert_product_purchasable();

-- ---------------------------------------------------------------------------
-- Seed Cloudinary platform settings
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, label, description, category, is_secret) values
  ('CLOUDINARY_CLOUD_NAME', 'Cloudinary Cloud Name',
    'Your Cloudinary cloud name (found in Settings → Account)', 'storage', false),
  ('CLOUDINARY_API_KEY', 'Cloudinary API Key',
    'Cloudinary API key for signed uploads', 'storage', false),
  ('CLOUDINARY_API_SECRET', 'Cloudinary API Secret',
    'Cloudinary API secret used to sign upload requests (server-only)', 'storage', true),
  ('CLOUDINARY_UPLOAD_FOLDER', 'Cloudinary Upload Folder',
    'Folder prefix for product images, e.g. "ecove/products"', 'storage', false)
on conflict (key) do nothing;
