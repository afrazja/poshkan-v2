-- Log in with email OR username. Usernames are made case-insensitively unique,
-- plus two server-only helpers (service role) to resolve/check usernames without
-- exposing emails to the client.
--
-- NOTE: if two existing usernames differ only by case, the index below will fail
-- to create — rename one of them first, then re-run.

-- 1. Case-insensitive uniqueness (the existing UNIQUE on username is case-sensitive).
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- 2. Is a username free? (case-insensitive)
create or replace function public.username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(trim(p_username))
  );
$$;

-- 3. Resolve a username to its account email (used for username login).
create or replace function public.email_for_username(p_username text)
returns text
language sql
security definer
set search_path = public, auth
stable
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(trim(p_username))
  limit 1;
$$;

-- These leak account info, so only the server (service role) may call them.
revoke execute on function public.username_available(text) from anon, authenticated, public;
revoke execute on function public.email_for_username(text) from anon, authenticated, public;
grant execute on function public.username_available(text) to service_role;
grant execute on function public.email_for_username(text) to service_role;
