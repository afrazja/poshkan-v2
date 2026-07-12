-- Public daily market scans (golden cross, RSI oversold, 52-week highs, …).
-- One row per scan per day; the /scans pages read the latest row per slug.
-- Run once in the Supabase SQL editor. The app degrades gracefully (pages
-- show "results are being computed") until this exists and the cron has run.

create table if not exists public.market_scans (
  id         uuid primary key default gen_random_uuid(),
  scan_slug  text not null,
  run_date   date not null,
  results    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (scan_slug, run_date)
);

create index if not exists market_scans_latest_idx
  on public.market_scans (scan_slug, run_date desc);

-- Server-only (service role writes via cron, pages read server-side);
-- keep RLS on with no public policies so anon/authenticated see nothing.
alter table public.market_scans enable row level security;
