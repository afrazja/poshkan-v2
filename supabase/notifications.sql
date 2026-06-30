-- In-app notification center: a stored copy of every push sent to the user.
-- Run once in the Supabase SQL editor. The app degrades gracefully if unrun.
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  body       text not null,
  url        text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- Owner reads & marks read; inserts happen via the service role (push lib).
drop policy if exists "owner reads notifications" on public.notifications;
create policy "owner reads notifications" on public.notifications for select
  using (user_id = auth.uid());

drop policy if exists "owner updates notifications" on public.notifications;
create policy "owner updates notifications" on public.notifications for update
  using (user_id = auth.uid());
