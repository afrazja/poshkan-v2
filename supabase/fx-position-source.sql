-- Records which scanner opened a leveraged position:
--   'trend' | 'smc' | 'ote' | 'meanrev' | 'candlerange' | 'ai'  (NULL = opened manually).
-- Run once in the Supabase SQL editor. The app degrades gracefully if it hasn't run.
alter table public.fx_positions add column if not exists source text;
