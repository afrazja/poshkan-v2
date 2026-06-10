-- ============================================================================
-- Web push subscriptions + AI trade journal (run AFTER mcp.sql).
-- ============================================================================

-- Browser push subscriptions (one row per device/browser).
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subs_all_own" on public.push_subscriptions;
create policy "push_subs_all_own" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Trade journal: the WHY behind each trade, reviewed later by the AI coach.
create table if not exists public.journal_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  symbol     text not null,
  side       text not null check (side in ('BUY', 'SELL')),
  quantity   numeric(20, 8) not null,
  price      numeric(20, 8) not null,
  note       text not null,
  created_at timestamptz not null default now()
);
create index if not exists journal_user_idx on public.journal_entries (user_id, created_at desc);

alter table public.journal_entries enable row level security;
drop policy if exists "journal_all_own" on public.journal_entries;
create policy "journal_all_own" on public.journal_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
