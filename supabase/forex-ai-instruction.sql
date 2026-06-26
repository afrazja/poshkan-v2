-- Per-account custom AI trading instructions for the opportunity scanner.
-- NULL / blank = use Poshkan's built-in default strategy.
alter table public.accounts add column if not exists ai_instruction text;
