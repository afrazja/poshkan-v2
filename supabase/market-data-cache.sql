-- Shared OHLC cache for licensed market-data providers.
-- Only the service-role client reads or writes these tables.

create table if not exists public.market_candles (
  provider text not null,
  symbol text not null,
  provider_symbol text not null,
  timeframe text not null check (timeframe in ('1min', '5min', '15min', '30min', '45min', '1h', '2h', '4h', '8h', '1day', '1week')),
  open_time timestamptz not null,
  open double precision not null check (open > 0),
  high double precision not null check (high > 0),
  low double precision not null check (low > 0),
  close double precision not null check (close > 0),
  volume double precision check (volume is null or volume >= 0),
  ingested_at timestamptz not null default now(),
  primary key (provider, symbol, timeframe, open_time),
  check (high >= greatest(open, close, low)),
  check (low <= least(open, close, high))
);

create index if not exists market_candles_lookup_idx
  on public.market_candles (symbol, timeframe, open_time desc);

create table if not exists public.market_data_syncs (
  provider text not null,
  symbol text not null,
  provider_symbol text not null,
  timeframe text not null,
  requested_size integer not null default 0 check (requested_size >= 0),
  available_bars integer not null default 0 check (available_bars >= 0),
  first_open_time timestamptz,
  last_open_time timestamptz,
  synced_at timestamptz not null default now(),
  primary key (provider, symbol, timeframe)
);

alter table public.market_candles enable row level security;
alter table public.market_data_syncs enable row level security;

comment on table public.market_candles is
  'Normalized provider candles used by backtests and live paper scanners.';
comment on table public.market_data_syncs is
  'Tracks fetch freshness and available history for each provider series.';
