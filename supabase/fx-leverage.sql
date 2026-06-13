-- Per-account forex leverage, chosen by the user when creating a forex account.
-- Only meaningful for forex accounts; the default keeps existing accounts at 30:1.
-- Margin is computed in the app (lib/forex.ts marginFor) and passed to fx_open,
-- so no RPC changes are needed — this column just feeds that computation.

alter table public.accounts
  add column if not exists leverage int not null default 30;

alter table public.accounts
  drop constraint if exists accounts_leverage_range;

alter table public.accounts
  add constraint accounts_leverage_range check (leverage between 1 and 1000);
