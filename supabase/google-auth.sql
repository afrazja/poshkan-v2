-- Google/social auth profile support.
-- Run once in the Supabase SQL Editor before enabling the Google provider.
-- Safe to re-run. Existing users and profiles are unchanged.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_username text;
  v_suffix integer := 0;
begin
  v_username := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');

  if v_username is not null then
    insert into public.profiles (id, username)
    values (new.id, v_username)
    on conflict (id) do nothing;
  else
    -- OAuth providers do not receive the username collected by email signup.
    -- Generate one without exposing the user's email address on leaderboards.
    v_username := 'trader_' || left(replace(new.id::text, '-', ''), 12);
    loop
      begin
        insert into public.profiles (id, username)
        values (new.id, v_username)
        on conflict (id) do nothing;
        exit;
      exception when unique_violation then
        v_suffix := v_suffix + 1;
        v_username := 'trader_' || left(replace(new.id::text, '-', ''), 12)
          || '_' || v_suffix::text;
      end;
    end loop;
  end if;

  return new;
end;
$$;
