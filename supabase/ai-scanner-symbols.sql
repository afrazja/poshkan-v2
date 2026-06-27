-- Per-account symbol list for the AI scanner (blank/null = the market's default
-- universe). Must belong to the account's asset class (enforced in code).
alter table public.accounts add column if not exists ai_symbols text[];
