-- Records forex opportunity alerts already pushed, so the hourly scanner
-- doesn't re-notify the same setup over and over. Run once in Supabase.

create table if not exists public.fx_scan_alerts (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  symbol      text not null,
  direction   text not null check (direction in ('LONG', 'SHORT')),
  alerted_at  timestamptz not null default now()
);
create index if not exists fx_scan_alerts_lookup_idx
  on public.fx_scan_alerts (account_id, symbol, direction, alerted_at desc);

-- Server-only (service role); keep RLS on with no public policies.
alter table public.fx_scan_alerts enable row level security;
