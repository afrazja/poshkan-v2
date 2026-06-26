-- Per-account autonomous-trading settings (user-controlled from the UI).
-- The scanner reads these instead of hard-coded env constants.
alter table public.accounts
  add column if not exists auto_trade_enabled  boolean       not null default false,
  add column if not exists auto_risk_pct       numeric(6, 4) not null default 0.01,  -- 1% of cash per trade
  add column if not exists auto_max_open       int           not null default 3,
  add column if not exists auto_max_per_day    int           not null default 2,
  add column if not exists auto_daily_loss_pct numeric(6, 4) not null default 0.03,  -- halt after -3% realized today
  add column if not exists auto_min_minutes    int           not null default 60;    -- min minutes between auto-trades
