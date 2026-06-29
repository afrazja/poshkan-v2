-- Per-scanner max hold time: auto-close a scanner-opened trade after N hours (0 = off).
-- Run once in the Supabase SQL editor. The app degrades gracefully (treats it as 0) if unrun.
alter table public.smc_settings         add column if not exists auto_close_hours int not null default 0;
alter table public.ote_settings         add column if not exists auto_close_hours int not null default 0;
alter table public.trend_settings       add column if not exists auto_close_hours int not null default 0;
alter table public.meanrev_settings     add column if not exists auto_close_hours int not null default 0;
alter table public.candlerange_settings add column if not exists auto_close_hours int not null default 0;
