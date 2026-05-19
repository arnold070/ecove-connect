-- Add 'cancelled' to refund_request_status, updated_at column + trigger,
-- and a buyer-cancel RLS policy so users can cancel their own pending refunds.

alter type public.refund_request_status add value if not exists 'cancelled';

alter table public.refund_requests
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.refund_requests_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists trg_refund_requests_touch on public.refund_requests;
create trigger trg_refund_requests_touch
  before update on public.refund_requests
  for each row execute function public.refund_requests_touch_updated_at();

-- Buyer can cancel (update) their own request only while still 'requested'.
drop policy if exists "refund_request_buyer_cancel" on public.refund_requests;
create policy "refund_request_buyer_cancel" on public.refund_requests
  for update to authenticated
  using (buyer_id = auth.uid() and status = 'requested')
  with check (buyer_id = auth.uid() and status in ('requested','cancelled'));
