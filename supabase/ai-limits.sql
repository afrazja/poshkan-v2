-- ============================================================================
-- Per-user AI-review usage log (run AFTER push-journal.sql).
-- Powers a daily quota + "nothing new since last review" dedup so a single
-- user can't drain the shared Anthropic API budget.
-- ============================================================================
create table if not exists public.ai_reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_entry_at timestamptz  -- newest journal entry at the time of this review
);
create index if not exists ai_reviews_user_idx on public.ai_reviews (user_id, created_at desc);

alter table public.ai_reviews enable row level security;
drop policy if exists "ai_reviews_own" on public.ai_reviews;
create policy "ai_reviews_own" on public.ai_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
