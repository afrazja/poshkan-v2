-- Per-scanner "max position size": the largest slice of free cash a single
-- auto-trade may tie up as margin (stored as a fraction; 0.25 = 25%). Replaces
-- the hardcoded cap so users can tune how much each scanner risks per trade.
-- Run once in the Supabase SQL editor. Degrades to 0.25 until run.
alter table public.smc_settings         add column if not exists max_position_pct numeric not null default 0.25;
alter table public.ote_settings         add column if not exists max_position_pct numeric not null default 0.25;
alter table public.trend_settings       add column if not exists max_position_pct numeric not null default 0.25;
alter table public.meanrev_settings     add column if not exists max_position_pct numeric not null default 0.25;
alter table public.candlerange_settings add column if not exists max_position_pct numeric not null default 0.25;

-- The AI scanner uses a per-account value.
alter table public.accounts add column if not exists auto_max_position_pct numeric not null default 0.25;
