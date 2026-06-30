-- Per-trade leverage (1/2/5/10, default 1). Leverage is chosen on each trade
-- now — by the user in the open form, or by a scanner in its settings — instead
-- of a fixed account-level leverage. Run once in the Supabase SQL editor.

-- Pending forex entry orders remember the leverage chosen when placed.
alter table public.fx_orders add column if not exists leverage int not null default 1;

-- Each deterministic scanner picks the leverage for the trades it opens.
alter table public.smc_settings         add column if not exists leverage int not null default 1;
alter table public.ote_settings         add column if not exists leverage int not null default 1;
alter table public.trend_settings       add column if not exists leverage int not null default 1;
alter table public.meanrev_settings     add column if not exists leverage int not null default 1;
alter table public.candlerange_settings add column if not exists leverage int not null default 1;

-- The AI scanner's auto-trades use a per-account leverage.
alter table public.accounts add column if not exists auto_leverage int not null default 1;
