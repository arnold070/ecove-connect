-- =============================================================================
-- Phase 3 — Paystack checkout, webhook idempotency, paystack platform settings.
-- File: db/0008_paystack_orders.sql
-- =============================================================================
set search_path = public;

-- ---------------------------------------------------------------------------
-- Webhook event log for Paystack idempotency
-- ---------------------------------------------------------------------------
create table if not exists public.payment_webhook_events (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null default 'paystack',
  event_id        text not null,
  event_type      text not null,
  reference       text,
  order_id        uuid references public.orders(id) on delete set null,
  payload         jsonb not null,
  signature       text,
  processed_at    timestamptz,
  error           text,
  created_at      timestamptz not null default now(),
  unique (provider, event_id)
);
alter table public.payment_webhook_events enable row level security;

drop policy if exists "webhook_events admin read" on public.payment_webhook_events;
create policy "webhook_events admin read" on public.payment_webhook_events
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create index if not exists idx_webhook_events_ref on public.payment_webhook_events(reference);
create index if not exists idx_webhook_events_order on public.payment_webhook_events(order_id);

-- ---------------------------------------------------------------------------
-- Make sure orders can be updated by admin / service role on webhook,
-- and add a paid_at column.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists paid_at timestamptz,
  add column if not exists paystack_access_code text,
  add column if not exists paystack_authorization_url text;

-- ---------------------------------------------------------------------------
-- Admin update on order_items (status transitions)
-- ---------------------------------------------------------------------------
drop policy if exists "order_items admin update" on public.order_items;
create policy "order_items admin update" on public.order_items
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- Seed additional platform_settings for Paystack callbacks + webhook
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, label, description, category, is_secret) values
  ('PAYSTACK_WEBHOOK_SECRET',
    'Paystack Webhook Secret',
    'Secret used to verify x-paystack-signature on incoming webhooks. Usually same as PAYSTACK_SECRET_KEY.',
    'payments', true),
  ('PAYSTACK_CALLBACK_URL',
    'Paystack Callback URL',
    'URL Paystack redirects buyers to after payment (e.g. https://your-site.com/checkout/success).',
    'payments', false),
  ('PLATFORM_COMMISSION_BPS',
    'Platform commission (basis points)',
    'Platform fee in basis points (e.g. 500 = 5%). Applied to each order_item at checkout.',
    'payments', false)
on conflict (key) do nothing;
