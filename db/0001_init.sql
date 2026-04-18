-- =============================================================================
-- Ecove Marketplace — Initial Schema
-- File: db/0001_init.sql
--
-- HOW TO RUN: see db/README.md
-- =============================================================================

set search_path = public;

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('customer', 'vendor', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vendor_status as enum ('pending', 'approved', 'suspended', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.product_status as enum ('draft', 'pending', 'approved', 'rejected', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum
    ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payout_status as enum ('pending', 'processing', 'paid', 'failed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- HELPER: updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

-- ---------------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- USER ROLES
-- ---------------------------------------------------------------------------
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'customer')
  on conflict do nothing;

  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- VENDORS
-- ---------------------------------------------------------------------------
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  store_name text not null,
  slug citext not null unique,
  description text,
  logo_url text,
  banner_url text,
  status public.vendor_status not null default 'pending',
  commission_bps int not null default 1000,
  payout_bank_name text,
  payout_account_number text,
  payout_account_name text,
  whatsapp text,
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.vendors enable row level security;
create index if not exists idx_vendors_status on public.vendors(status);

drop trigger if exists trg_vendors_updated_at on public.vendors;
create trigger trg_vendors_updated_at before update on public.vendors
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- CATEGORIES
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug citext not null unique,
  icon text,
  position int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;
create index if not exists idx_categories_parent on public.categories(parent_id);

-- ---------------------------------------------------------------------------
-- PRODUCTS
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  title text not null,
  slug citext not null unique,
  description text,
  price_kobo bigint not null check (price_kobo >= 0),
  compare_at_kobo bigint check (compare_at_kobo is null or compare_at_kobo >= 0),
  stock int not null default 0 check (stock >= 0),
  sku text,
  weight_grams int,
  status public.product_status not null default 'pending',
  rejection_reason text,
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  views_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products enable row level security;
create index if not exists idx_products_vendor on public.products(vendor_id);
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_status on public.products(status);
create index if not exists idx_products_title_trgm on public.products using gin (to_tsvector('simple', title));

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at before update on public.products
for each row execute function public.set_updated_at();

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.product_images enable row level security;
create index if not exists idx_product_images_product on public.product_images(product_id);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sku text,
  price_kobo bigint check (price_kobo is null or price_kobo >= 0),
  stock int not null default 0 check (stock >= 0),
  created_at timestamptz not null default now()
);
alter table public.product_variants enable row level security;

-- ---------------------------------------------------------------------------
-- ADDRESSES, CARTS, ORDERS, PAYMENTS, SHIPMENTS
-- ---------------------------------------------------------------------------
create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  street text not null,
  city text not null,
  state text not null,
  country text not null default 'Nigeria',
  postal_code text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.addresses enable row level security;
create index if not exists idx_addresses_user on public.addresses(user_id);

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  guest_token uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or guest_token is not null)
);
alter table public.carts enable row level security;

drop trigger if exists trg_carts_updated_at on public.carts;
create trigger trg_carts_updated_at before update on public.carts
for each row execute function public.set_updated_at();

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  quantity int not null check (quantity > 0),
  unit_price_kobo bigint not null check (unit_price_kobo >= 0),
  created_at timestamptz not null default now()
);
alter table public.cart_items enable row level security;
create index if not exists idx_cart_items_cart on public.cart_items(cart_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('EC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  customer_id uuid not null references auth.users(id) on delete restrict,
  address_id uuid references public.addresses(id) on delete set null,
  shipping_snapshot jsonb,
  subtotal_kobo bigint not null default 0,
  shipping_kobo bigint not null default 0,
  discount_kobo bigint not null default 0,
  total_kobo bigint not null default 0,
  status public.order_status not null default 'pending',
  paystack_reference text unique,
  coupon_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders enable row level security;
create index if not exists idx_orders_customer on public.orders(customer_id);
create index if not exists idx_orders_status on public.orders(status);

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at before update on public.orders
for each row execute function public.set_updated_at();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_title text not null,
  quantity int not null check (quantity > 0),
  unit_price_kobo bigint not null check (unit_price_kobo >= 0),
  commission_kobo bigint not null default 0,
  vendor_payout_kobo bigint not null default 0,
  status public.order_status not null default 'pending',
  created_at timestamptz not null default now()
);
alter table public.order_items enable row level security;
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_order_items_vendor on public.order_items(vendor_id);

create or replace function public.recalc_order_totals()
returns trigger language plpgsql as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
begin
  update public.orders o
  set subtotal_kobo = coalesce((
        select sum(quantity * unit_price_kobo) from public.order_items where order_id = v_order_id
      ), 0),
      total_kobo = coalesce((
        select sum(quantity * unit_price_kobo) from public.order_items where order_id = v_order_id
      ), 0) + o.shipping_kobo - o.discount_kobo
  where o.id = v_order_id;
  return null;
end; $$;

drop trigger if exists trg_order_items_recalc on public.order_items;
create trigger trg_order_items_recalc
after insert or update or delete on public.order_items
for each row execute function public.recalc_order_totals();

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'paystack',
  provider_reference text not null,
  amount_kobo bigint not null,
  status text not null,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_reference)
);
alter table public.payments enable row level security;
create index if not exists idx_payments_order on public.payments(order_id);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  carrier text,
  tracking_number text,
  status text not null default 'pending',
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.shipments enable row level security;

-- ---------------------------------------------------------------------------
-- REVIEWS, PAYOUTS, COUPONS, WISHLISTS, MESSAGES, BANNERS, AUDIT, FRAUD
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  title text,
  body text,
  created_at timestamptz not null default now(),
  unique (product_id, customer_id)
);
alter table public.reviews enable row level security;
create index if not exists idx_reviews_product on public.reviews(product_id);

create table if not exists public.vendor_payouts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  amount_kobo bigint not null,
  status public.payout_status not null default 'pending',
  reference text,
  notes text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.vendor_payouts enable row level security;

create table if not exists public.payout_items (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.vendor_payouts(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  amount_kobo bigint not null
);
alter table public.payout_items enable row level security;

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code citext not null unique,
  description text,
  discount_bps int,
  discount_kobo bigint,
  max_uses int,
  uses int not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.coupons enable row level security;

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  amount_kobo bigint not null,
  created_at timestamptz not null default now()
);
alter table public.coupon_redemptions enable row level security;

create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.wishlists enable row level security;

create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.wishlists(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (wishlist_id, product_id)
);
alter table public.wishlist_items enable row level security;

create table if not exists public.vendor_messages (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.vendor_messages enable row level security;
create index if not exists idx_vendor_messages_vendor on public.vendor_messages(vendor_id);
create index if not exists idx_vendor_messages_customer on public.vendor_messages(customer_id);

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text not null,
  link_url text,
  position int not null default 0,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.banners enable row level security;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;

create table if not exists public.fraud_flags (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  entity_id uuid not null,
  reason text not null,
  severity text not null default 'low',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.fraud_flags enable row level security;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

drop policy if exists "profiles self select" on public.profiles;
create policy "profiles self select" on public.profiles
  for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "user_roles self read" on public.user_roles;
create policy "user_roles self read" on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists "user_roles admin write" on public.user_roles;
create policy "user_roles admin write" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "vendors public read approved" on public.vendors;
create policy "vendors public read approved" on public.vendors
  for select using (status = 'approved' or owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists "vendors owner insert" on public.vendors;
create policy "vendors owner insert" on public.vendors
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "vendors owner update" on public.vendors;
create policy "vendors owner update" on public.vendors
  for update to authenticated
  using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists "vendors admin delete" on public.vendors;
create policy "vendors admin delete" on public.vendors
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "categories public read" on public.categories;
create policy "categories public read" on public.categories for select using (true);
drop policy if exists "categories admin write" on public.categories;
create policy "categories admin write" on public.categories
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "products public read approved" on public.products;
create policy "products public read approved" on public.products
  for select using (
    status = 'approved'
    or exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  );
drop policy if exists "products vendor write" on public.products;
create policy "products vendor write" on public.products
  for all to authenticated
  using (
    exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  )
  with check (
    exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  );

drop policy if exists "product_images public read" on public.product_images;
create policy "product_images public read" on public.product_images
  for select using (
    exists (select 1 from public.products p where p.id = product_id and (
      p.status = 'approved'
      or exists (select 1 from public.vendors v where v.id = p.vendor_id and v.owner_id = auth.uid())
      or public.has_role(auth.uid(), 'admin')
    ))
  );
drop policy if exists "product_images vendor write" on public.product_images;
create policy "product_images vendor write" on public.product_images
  for all to authenticated
  using (
    exists (select 1 from public.products p join public.vendors v on v.id = p.vendor_id
            where p.id = product_id and (v.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin')))
  )
  with check (
    exists (select 1 from public.products p join public.vendors v on v.id = p.vendor_id
            where p.id = product_id and (v.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin')))
  );

drop policy if exists "product_variants public read" on public.product_variants;
create policy "product_variants public read" on public.product_variants
  for select using (
    exists (select 1 from public.products p where p.id = product_id and p.status = 'approved')
    or public.has_role(auth.uid(), 'admin')
  );
drop policy if exists "product_variants vendor write" on public.product_variants;
create policy "product_variants vendor write" on public.product_variants
  for all to authenticated
  using (
    exists (select 1 from public.products p join public.vendors v on v.id = p.vendor_id
            where p.id = product_id and (v.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin')))
  )
  with check (
    exists (select 1 from public.products p join public.vendors v on v.id = p.vendor_id
            where p.id = product_id and (v.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin')))
  );

drop policy if exists "addresses self all" on public.addresses;
create policy "addresses self all" on public.addresses
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "carts self all" on public.carts;
create policy "carts self all" on public.carts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "cart_items self all" on public.cart_items;
create policy "cart_items self all" on public.cart_items
  for all to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));

drop policy if exists "orders customer read" on public.orders;
create policy "orders customer read" on public.orders
  for select to authenticated using (
    customer_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.order_items oi join public.vendors v on v.id = oi.vendor_id
      where oi.order_id = orders.id and v.owner_id = auth.uid()
    )
  );
drop policy if exists "orders customer insert" on public.orders;
create policy "orders customer insert" on public.orders
  for insert to authenticated with check (customer_id = auth.uid());
drop policy if exists "orders admin update" on public.orders;
create policy "orders admin update" on public.orders
  for update to authenticated using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "order_items read" on public.order_items;
create policy "order_items read" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
    or exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  );
drop policy if exists "order_items vendor update" on public.order_items;
create policy "order_items vendor update" on public.order_items
  for update to authenticated
  using (
    exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  )
  with check (
    exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  );

drop policy if exists "payments read" on public.payments;
create policy "payments read" on public.payments
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  );

drop policy if exists "shipments read" on public.shipments;
create policy "shipments read" on public.shipments
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
    or exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  );
drop policy if exists "shipments vendor write" on public.shipments;
create policy "shipments vendor write" on public.shipments
  for all to authenticated
  using (
    exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  )
  with check (
    exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  );

drop policy if exists "reviews public read" on public.reviews;
create policy "reviews public read" on public.reviews for select using (true);
drop policy if exists "reviews self write" on public.reviews;
create policy "reviews self write" on public.reviews
  for all to authenticated using (customer_id = auth.uid()) with check (customer_id = auth.uid());

drop policy if exists "payouts vendor read" on public.vendor_payouts;
create policy "payouts vendor read" on public.vendor_payouts
  for select to authenticated using (
    exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  );
drop policy if exists "payouts admin write" on public.vendor_payouts;
create policy "payouts admin write" on public.vendor_payouts
  for all to authenticated using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "payout_items admin all" on public.payout_items;
create policy "payout_items admin all" on public.payout_items
  for all to authenticated using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "coupons public read" on public.coupons;
create policy "coupons public read" on public.coupons
  for select using (active = true and (expires_at is null or expires_at > now()));
drop policy if exists "coupons admin write" on public.coupons;
create policy "coupons admin write" on public.coupons
  for all to authenticated using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "coupon_redemptions self read" on public.coupon_redemptions;
create policy "coupon_redemptions self read" on public.coupon_redemptions
  for select to authenticated using (customer_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "wishlists self all" on public.wishlists;
create policy "wishlists self all" on public.wishlists
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "wishlist_items self all" on public.wishlist_items;
create policy "wishlist_items self all" on public.wishlist_items
  for all to authenticated
  using (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = auth.uid()));

drop policy if exists "vendor_messages participants read" on public.vendor_messages;
create policy "vendor_messages participants read" on public.vendor_messages
  for select to authenticated using (
    customer_id = auth.uid()
    or exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  );
drop policy if exists "vendor_messages participants insert" on public.vendor_messages;
create policy "vendor_messages participants insert" on public.vendor_messages
  for insert to authenticated with check (
    sender_id = auth.uid() and (
      customer_id = auth.uid()
      or exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
    )
  );

drop policy if exists "banners public read" on public.banners;
create policy "banners public read" on public.banners
  for select using (active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now()));
drop policy if exists "banners admin write" on public.banners;
create policy "banners admin write" on public.banners
  for all to authenticated using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "audit_logs admin read" on public.audit_logs;
create policy "audit_logs admin read" on public.audit_logs
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "fraud_flags admin all" on public.fraud_flags;
create policy "fraud_flags admin all" on public.fraud_flags
  for all to authenticated using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- SEED
-- =============================================================================
insert into public.categories (name, slug, icon, position) values
  ('Phones & Tablets', 'phones-tablets', '📱', 1),
  ('Fashion',          'fashion',        '👗', 2),
  ('Home & Office',    'home-office',    '🏠', 3),
  ('Beauty & Health',  'beauty-health',  '💄', 4),
  ('Groceries',        'groceries',      '🛒', 5),
  ('Electronics',      'electronics',    '📺', 6),
  ('Computing',        'computing',      '💻', 7),
  ('Baby Products',    'baby',           '🍼', 8),
  ('Sporting Goods',   'sports',         '⚽', 9),
  ('Automotive',       'automotive',     '🚗', 10)
on conflict (slug) do nothing;
