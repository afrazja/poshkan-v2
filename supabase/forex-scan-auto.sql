-- Required before enabling autonomous trading (AUTO_TRADE_ENABLED=true).
-- Lets the scanner count how many trades it has auto-placed per account per day.
alter table public.fx_scan_alerts
  add column if not exists executed boolean not null default false;
