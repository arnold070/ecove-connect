-- =============================================================================
-- Ecove — Vendor KYC: extend vendors table, add kyc documents, storage bucket
-- File: db/0006_vendors_kyc.sql
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- Extend public.vendors with KYC + onboarding fields
-- ---------------------------------------------------------------------------
alter table public.vendors
  add column if not exists business_registration_number text,
  add column if not exists tax_id                       text,
  add column if not exists country                      text not null default 'Nigeria',
  add column if not exists city                         text,
  add column if not exists business_address             text,
  add column if not exists contact_email                text,
  add column if not exists submitted_at                 timestamptz,
  add column if not exists approved_at                  timestamptz,
  add column if not exists approved_by                  uuid references auth.users(id) on delete set null,
  add column if not exists rejection_reason             text;

-- vendors.status default should be 'pending' but new vendors start as 'draft' once
-- the enum is extended. We add 'draft' before tightening the default.
do $$ begin
  alter type public.vendor_status add value if not exists 'draft' before 'pending';
exception when others then null; end $$;

-- ---------------------------------------------------------------------------
-- KYC documents
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.kyc_doc_type as enum
    ('id_front', 'id_back', 'business_reg', 'tax_cert', 'address_proof', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.kyc_doc_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.vendor_kyc_documents (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendors(id) on delete cascade,
  doc_type      public.kyc_doc_type not null,
  storage_path  text not null,
  status        public.kyc_doc_status not null default 'pending',
  reviewer_note text,
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.vendor_kyc_documents enable row level security;
create index if not exists idx_vendor_kyc_vendor on public.vendor_kyc_documents(vendor_id);

-- Owner reads/writes their own; admin full access.
drop policy if exists "kyc owner read" on public.vendor_kyc_documents;
create policy "kyc owner read" on public.vendor_kyc_documents
  for select to authenticated
  using (
    exists (select 1 from public.vendors v
            where v.id = vendor_id and v.owner_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  );

drop policy if exists "kyc owner insert" on public.vendor_kyc_documents;
create policy "kyc owner insert" on public.vendor_kyc_documents
  for insert to authenticated
  with check (
    exists (select 1 from public.vendors v
            where v.id = vendor_id and v.owner_id = auth.uid())
  );

drop policy if exists "kyc owner delete" on public.vendor_kyc_documents;
create policy "kyc owner delete" on public.vendor_kyc_documents
  for delete to authenticated
  using (
    exists (select 1 from public.vendors v
            where v.id = vendor_id and v.owner_id = auth.uid()
              and v.status in ('draft','pending','rejected'))
    or public.has_role(auth.uid(), 'admin')
  );

drop policy if exists "kyc admin update" on public.vendor_kyc_documents;
create policy "kyc admin update" on public.vendor_kyc_documents
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- Storage bucket: kyc-documents (PRIVATE)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('kyc-documents', 'kyc-documents', false)
on conflict (id) do nothing;

-- Owners may read their own files (folder = their auth uid).
drop policy if exists "kyc-documents owner read" on storage.objects;
create policy "kyc-documents owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kyc-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.has_role(auth.uid(), 'admin')
    )
  );

drop policy if exists "kyc-documents owner upload" on storage.objects;
create policy "kyc-documents owner upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "kyc-documents owner delete" on storage.objects;
create policy "kyc-documents owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'kyc-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.has_role(auth.uid(), 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Vendor onboarding audit (admin approve/reject trail)
-- ---------------------------------------------------------------------------
create table if not exists public.vendor_onboarding_audit (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references public.vendors(id) on delete cascade,
  action      text not null check (action in ('submit','approve','reject','suspend','reinstate')),
  note        text,
  actor_id    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.vendor_onboarding_audit enable row level security;
create index if not exists idx_vendor_onboard_audit_vendor on public.vendor_onboarding_audit(vendor_id);

drop policy if exists "vendor_onboard_audit read" on public.vendor_onboarding_audit;
create policy "vendor_onboard_audit read" on public.vendor_onboarding_audit
  for select to authenticated
  using (
    exists (select 1 from public.vendors v
            where v.id = vendor_id and v.owner_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  );

drop policy if exists "vendor_onboard_audit insert" on public.vendor_onboarding_audit;
create policy "vendor_onboard_audit insert" on public.vendor_onboarding_audit
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and (
      exists (select 1 from public.vendors v
              where v.id = vendor_id and v.owner_id = auth.uid())
      or public.has_role(auth.uid(), 'admin')
    )
  );
