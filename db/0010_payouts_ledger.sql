-- =============================================================================
-- Phase 4 — Vendor ledger, payout requests, fulfillment, atomic stock,
-- refund reversal trigger, webhook rate-limit table.
-- File: db/0010_payouts_ledger.sql
-- =============================================================================
set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Fulfillment columns on order_items
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.fulfillment_status as enum
    ('pending','processing','shipped','delivered','cancelled','refunded');
exception when duplicate_object then null; end $$;

alter table public.order_items
  add column if not exists fulfillment_status public.fulfillment_status not null default 'pending',
  add column if not exists tracking_carrier text,
  add column if not exists tracking_ref     text,
  add column if not exists shipped_at       timestamptz,
  add column if not exists delivered_at     timestamptz,
  add column if not exists refunded_at      timestamptz;

create index if not exists idx_order_items_fulfillment
  on public.order_items(fulfillment_status);

-- ---------------------------------------------------------------------------
-- 2. Vendor ledger (append-only money movement)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.ledger_entry_type as enum
    ('sale','refund','payout','fee','adjustment');
exception when duplicate_object then null; end $$;

create table if not exists public.vendor_ledger (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendors(id) on delete restrict,
  entry_type    public.ledger_entry_type not null,
  amount_kobo   bigint not null,            -- positive = credit vendor, negative = debit
  order_item_id uuid references public.order_items(id) on delete set null,
  payout_id     uuid,                       -- FK added after payout_requests
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_vendor_ledger_vendor on public.vendor_ledger(vendor_id, created_at desc);
create index if not exists idx_vendor_ledger_item   on public.vendor_ledger(order_item_id);
create unique index if not exists uq_vendor_ledger_sale_per_item
  on public.vendor_ledger(order_item_id) where entry_type = 'sale';
create unique index if not exists uq_vendor_ledger_refund_per_item
  on public.vendor_ledger(order_item_id) where entry_type = 'refund';

alter table public.vendor_ledger enable row level security;

drop policy if exists "ledger_vendor_read" on public.vendor_ledger;
create policy "ledger_vendor_read" on public.vendor_ledger
  for select to authenticated using (
    exists (select 1 from public.vendors v
            where v.id = vendor_id and v.owner_id = auth.uid())
    or public.has_role(auth.uid(),'admin')
  );

-- ---------------------------------------------------------------------------
-- 3. Payout requests
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.payout_request_status as enum
    ('requested','approved','processing','paid','failed','rejected','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.payout_requests (
  id                  uuid primary key default gen_random_uuid(),
  vendor_id           uuid not null references public.vendors(id) on delete restrict,
  amount_kobo         bigint not null check (amount_kobo > 0),
  status              public.payout_request_status not null default 'requested',
  bank_name           text,
  bank_code           text,
  account_number      text,
  account_name        text,
  paystack_recipient_code text,
  paystack_transfer_code  text,
  paystack_transfer_ref   text,
  failure_reason      text,
  requested_by        uuid references auth.users(id) on delete set null,
  processed_by        uuid references auth.users(id) on delete set null,
  processed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists trg_payout_requests_updated on public.payout_requests;
create trigger trg_payout_requests_updated before update on public.payout_requests
  for each row execute function public.set_updated_at();

alter table public.payout_requests enable row level security;

drop policy if exists "payout_vendor_read" on public.payout_requests;
create policy "payout_vendor_read" on public.payout_requests
  for select to authenticated using (
    exists (select 1 from public.vendors v
            where v.id = vendor_id and v.owner_id = auth.uid())
    or public.has_role(auth.uid(),'admin')
  );

drop policy if exists "payout_vendor_insert" on public.payout_requests;
create policy "payout_vendor_insert" on public.payout_requests
  for insert to authenticated with check (
    exists (select 1 from public.vendors v
            where v.id = vendor_id and v.owner_id = auth.uid() and v.status='approved')
  );

drop policy if exists "payout_vendor_cancel" on public.payout_requests;
create policy "payout_vendor_cancel" on public.payout_requests
  for update to authenticated using (
    exists (select 1 from public.vendors v
            where v.id = vendor_id and v.owner_id = auth.uid())
    and status = 'requested'
  ) with check (
    status in ('requested','cancelled')
  );

drop policy if exists "payout_admin_update" on public.payout_requests;
create policy "payout_admin_update" on public.payout_requests
  for update to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- Link ledger.payout_id -> payout_requests now that the table exists
do $$ begin
  alter table public.vendor_ledger
    add constraint vendor_ledger_payout_fk
    foreign key (payout_id) references public.payout_requests(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 4. vendor_balance(vendor_id) — sum of ledger
-- ---------------------------------------------------------------------------
create or replace function public.vendor_balance(_vendor_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount_kobo), 0)::bigint
  from public.vendor_ledger
  where vendor_id = _vendor_id;
$$;

-- ---------------------------------------------------------------------------
-- 5. Credit ledger on order.paid (one 'sale' per order_item, idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.credit_vendor_ledger_on_paid()
returns trigger language plpgsql as $$
declare
  r record;
begin
  if new.status = 'paid' and (old.status is distinct from 'paid') then
    for r in
      select id, vendor_id, vendor_payout_kobo, commission_kobo
      from public.order_items where order_id = new.id
    loop
      insert into public.vendor_ledger (vendor_id, entry_type, amount_kobo, order_item_id, note)
      values (r.vendor_id, 'sale', r.vendor_payout_kobo, r.id,
              'Sale credit for order ' || new.order_number)
      on conflict do nothing;
    end loop;
  end if;
  return new;
end; $$;

drop trigger if exists trg_credit_ledger_on_paid on public.orders;
create trigger trg_credit_ledger_on_paid
  after update of status on public.orders
  for each row execute function public.credit_vendor_ledger_on_paid();

-- ---------------------------------------------------------------------------
-- 6. Atomic stock decrement (called from webhook after marking paid)
--    Returns count of items whose stock could not be decremented.
-- ---------------------------------------------------------------------------
create or replace function public.decrement_stock_for_order(_order_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  failed int := 0;
begin
  for r in
    select product_id, sum(quantity)::int as qty
    from public.order_items where order_id = _order_id
    group by product_id
  loop
    update public.products
      set stock = stock - r.qty
      where id = r.product_id and stock >= r.qty;
    if not found then
      failed := failed + 1;
    end if;
  end loop;
  return failed;
end; $$;

-- Reverse stock + ledger on refund (item-level or full order)
create or replace function public.refund_order_item(_order_item_id uuid, _note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  it record;
begin
  select id, vendor_id, product_id, quantity, vendor_payout_kobo, fulfillment_status
    into it from public.order_items where id = _order_item_id for update;
  if not found then raise exception 'order_item not found'; end if;
  if it.fulfillment_status = 'refunded' then return; end if;

  -- restock
  update public.products set stock = stock + it.quantity where id = it.product_id;

  -- mark item refunded
  update public.order_items
    set fulfillment_status = 'refunded',
        status = 'refunded',
        refunded_at = now()
    where id = it.id;

  -- ledger reversal (negative credit)
  insert into public.vendor_ledger (vendor_id, entry_type, amount_kobo, order_item_id, note)
  values (it.vendor_id, 'refund', -it.vendor_payout_kobo, it.id,
          coalesce(_note, 'Refund for item'))
  on conflict do nothing;
end; $$;

-- ---------------------------------------------------------------------------
-- 7. Webhook rate-limit bucket (sliding window per ip+route)
-- ---------------------------------------------------------------------------
create table if not exists public.request_rate_limit (
  bucket_key  text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (bucket_key, window_start)
);
create index if not exists idx_rate_limit_window
  on public.request_rate_limit(window_start);

create or replace function public.bump_rate_limit(_key text, _window_seconds int default 60)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz;
  c int;
begin
  w := date_trunc('second', now()) - (extract(epoch from now())::bigint % _window_seconds) * interval '1 second';
  insert into public.request_rate_limit (bucket_key, window_start, count)
  values (_key, w, 1)
  on conflict (bucket_key, window_start)
  do update set count = public.request_rate_limit.count + 1
  returning count into c;
  -- janitor: delete buckets older than 1h
  delete from public.request_rate_limit where window_start < now() - interval '1 hour';
  return c;
end; $$;

-- ---------------------------------------------------------------------------
-- 8. Order item buyer/admin update policies
--    Buyer can confirm delivery on own order's items.
-- ---------------------------------------------------------------------------
drop policy if exists "order_items buyer confirm" on public.order_items;
create policy "order_items buyer confirm" on public.order_items
  for update to authenticated
  using (
    exists (select 1 from public.orders o
            where o.id = order_id and o.customer_id = auth.uid())
  )
  with check (
    exists (select 1 from public.orders o
            where o.id = order_id and o.customer_id = auth.uid())
  );

-- Vendor can update fulfillment on own items
drop policy if exists "order_items vendor fulfill" on public.order_items;
create policy "order_items vendor fulfill" on public.order_items
  for update to authenticated
  using (
    exists (select 1 from public.vendors v
            where v.id = vendor_id and v.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.vendors v
            where v.id = vendor_id and v.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 9. Refund request table (buyer-initiated, admin-decided)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.refund_request_status as enum
    ('requested','approved','rejected','refunded');
exception when duplicate_object then null; end $$;

create table if not exists public.refund_requests (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  buyer_id      uuid not null references auth.users(id) on delete cascade,
  reason        text not null,
  status        public.refund_request_status not null default 'requested',
  admin_note    text,
  processed_by  uuid references auth.users(id) on delete set null,
  processed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_refund_requests_status on public.refund_requests(status);
create index if not exists idx_refund_requests_item on public.refund_requests(order_item_id);

alter table public.refund_requests enable row level security;

drop policy if exists "refund_request_owner_read" on public.refund_requests;
create policy "refund_request_owner_read" on public.refund_requests
  for select to authenticated using (
    buyer_id = auth.uid()
    or exists (select 1 from public.order_items oi
               join public.vendors v on v.id = oi.vendor_id
               where oi.id = order_item_id and v.owner_id = auth.uid())
    or public.has_role(auth.uid(),'admin')
  );

drop policy if exists "refund_request_buyer_insert" on public.refund_requests;
create policy "refund_request_buyer_insert" on public.refund_requests
  for insert to authenticated with check (
    buyer_id = auth.uid()
    and exists (select 1 from public.order_items oi
                join public.orders o on o.id = oi.order_id
                where oi.id = order_item_id and o.customer_id = auth.uid())
  );

drop policy if exists "refund_request_admin_update" on public.refund_requests;
create policy "refund_request_admin_update" on public.refund_requests
  for update to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- ---------------------------------------------------------------------------
-- 10. Seed payout-related platform settings
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, label, description, category, is_secret) values
  ('PAYSTACK_TRANSFER_ENABLED',
    'Enable Paystack Transfers',
    'When true, admin approval of a payout calls Paystack Transfer API. Otherwise marks as paid manually.',
    'payments', false),
  ('PAYOUT_MIN_KOBO',
    'Minimum payout amount (kobo)',
    'Vendors cannot request payouts below this. Default 100000 (₦1,000).',
    'payments', false)
on conflict (key) do nothing;
