-- =============================================================================
-- Platform Settings / API Keys table
-- Stores configuration keys (Sentry DSN, Paystack keys, Stripe keys, etc.)
-- Only admins can read/write.
-- =============================================================================

set search_path = public;

create table if not exists public.platform_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text not null default '',
  label text not null,
  description text,
  category text not null default 'general',
  is_secret boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

drop trigger if exists trg_platform_settings_updated_at on public.platform_settings;
create trigger trg_platform_settings_updated_at before update on public.platform_settings
for each row execute function public.set_updated_at();

-- Only admins can read/write
create policy "Admins can select platform_settings"
  on public.platform_settings for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can insert platform_settings"
  on public.platform_settings for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update platform_settings"
  on public.platform_settings for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete platform_settings"
  on public.platform_settings for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Seed default keys
insert into public.platform_settings (key, label, description, category, is_secret) values
  ('SENTRY_DSN', 'Sentry DSN', 'Sentry Data Source Name for error tracking', 'monitoring', false),
  ('PAYSTACK_PUBLIC_KEY', 'Paystack Public Key', 'Paystack publishable/public API key', 'payments', false),
  ('PAYSTACK_SECRET_KEY', 'Paystack Secret Key', 'Paystack secret API key', 'payments', true),
  ('STRIPE_PUBLISHABLE_KEY', 'Stripe Publishable Key', 'Stripe publishable API key', 'payments', false),
  ('STRIPE_SECRET_KEY', 'Stripe Secret Key', 'Stripe secret API key', 'payments', true),
  ('GOOGLE_ANALYTICS_ID', 'Google Analytics ID', 'GA4 Measurement ID (e.g. G-XXXXXXXXXX)', 'analytics', false),
  ('SMTP_HOST', 'SMTP Host', 'SMTP server hostname for transactional emails', 'email', false),
  ('SMTP_PORT', 'SMTP Port', 'SMTP server port', 'email', false),
  ('SMTP_USERNAME', 'SMTP Username', 'SMTP authentication username', 'email', false),
  ('SMTP_PASSWORD', 'SMTP Password', 'SMTP authentication password', 'email', true)
on conflict (key) do nothing;
