-- Per-account notifications toggle. When false, that account's events still log
-- to the in-app notification center but no longer push to the user's phone.
-- Run once in the Supabase SQL editor. Degrades to "on" until run.
alter table public.accounts add column if not exists notify_enabled boolean not null default true;
