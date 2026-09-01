-- Per-user login counters for the admin dashboard. Safe to re-run.
--
-- Supabase Auth stores last_sign_in_at but never a count, so the only way to
-- have one is to record it ourselves. That means the counter starts at 0 for
-- every existing user and only reflects sign-ins from the day this migration
-- runs — last_sign_in_at remains the historical signal.

alter table public.profiles
  add column if not exists login_count   int not null default 0,
  add column if not exists last_login_at timestamptz;

-- Bump a user's counter. Security definer so the caller does not need write
-- access to profiles, and it takes the user id explicitly rather than reading
-- auth.uid() — it is called from the server right after a sign-in completes,
-- with the service role, so a client can never inflate its own number.
create or replace function public.record_login(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set login_count   = login_count + 1,
         last_login_at = now()
   where id = p_user_id;
$$;

-- Service role only: nothing signed in from a browser should be able to call
-- this (see hardening.sql for the pattern).
revoke execute on function public.record_login(uuid) from public, anon, authenticated;
grant execute on function public.record_login(uuid) to service_role;
