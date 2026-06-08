-- ============================================================================
-- Poshkan schema — run this in the Supabase SQL Editor (one time).
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles: one row per auth user, created automatically on sign-up.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text unique not null,
  avatar_url  text,
  theme       text not null default 'light' check (theme in ('light', 'dark')),
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- accounts: a user can have many paper-trading accounts.
-- ----------------------------------------------------------------------------
create table if not exists public.accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  name          text not null,
  type          text not null default 'stocks' check (type in ('stocks', 'crypto', 'forex')),
  cash_balance  numeric(20, 8) not null default 0 check (cash_balance >= 0),
  created_at    timestamptz not null default now()
);
create index if not exists accounts_user_id_idx on public.accounts (user_id);

-- ----------------------------------------------------------------------------
-- positions: current holdings (cached; ledger is the source of truth).
-- ----------------------------------------------------------------------------
create table if not exists public.positions (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  symbol      text not null,
  quantity    numeric(20, 8) not null check (quantity > 0),
  avg_cost    numeric(20, 8) not null check (avg_cost >= 0),
  unique (account_id, symbol)
);
create index if not exists positions_account_id_idx on public.positions (account_id);

-- ----------------------------------------------------------------------------
-- transactions: immutable ledger of every cash/position change.
-- ----------------------------------------------------------------------------
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  symbol      text,
  side        text not null check (side in ('BUY', 'SELL', 'OPENING_BALANCE', 'DEPOSIT', 'RESET')),
  quantity    numeric(20, 8) not null default 0,
  price       numeric(20, 8) not null default 0,
  cash_delta  numeric(20, 8) not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists transactions_account_id_idx on public.transactions (account_id, created_at desc);

-- ----------------------------------------------------------------------------
-- watchlist: symbols the user is tracking per account.
-- ----------------------------------------------------------------------------
create table if not exists public.watchlist (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  symbol      text not null,
  created_at  timestamptz not null default now(),
  unique (account_id, symbol)
);
create index if not exists watchlist_account_id_idx on public.watchlist (account_id);

-- ============================================================================
-- Auto-create a profile row when a new auth user confirms / signs up.
-- The username is taken from the sign-up metadata (raw_user_meta_data.username),
-- falling back to the email's local part.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'username',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Row-Level Security: a user can only touch their own data.
-- ============================================================================
alter table public.profiles     enable row level security;
alter table public.accounts     enable row level security;
alter table public.positions    enable row level security;
alter table public.transactions enable row level security;
alter table public.watchlist    enable row level security;

-- profiles -------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- accounts -------------------------------------------------------------------
drop policy if exists "accounts_all_own" on public.accounts;
create policy "accounts_all_own" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- helper: does the current user own this account?
create or replace function public.owns_account(acc uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.accounts a
    where a.id = acc and a.user_id = auth.uid()
  );
$$;

-- positions ------------------------------------------------------------------
drop policy if exists "positions_all_own" on public.positions;
create policy "positions_all_own" on public.positions
  for all using (public.owns_account(account_id)) with check (public.owns_account(account_id));

-- transactions (read-only from the client; writes go through RPCs) -----------
drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select using (public.owns_account(account_id));

-- watchlist ------------------------------------------------------------------
drop policy if exists "watchlist_all_own" on public.watchlist;
create policy "watchlist_all_own" on public.watchlist
  for all using (public.owns_account(account_id)) with check (public.owns_account(account_id));

-- ============================================================================
-- create_account: atomically create an account, seed cash + opening holdings.
-- holdings param: jsonb array of { symbol, quantity, avg_price }.
-- ============================================================================
create or replace function public.create_account(
  p_name text,
  p_type text,
  p_initial_cash numeric,
  p_holdings jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_account_id uuid;
  v_holding    jsonb;
  v_symbol     text;
  v_qty        numeric;
  v_price      numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(p_initial_cash, 0) < 0 then
    raise exception 'Initial cash cannot be negative';
  end if;

  insert into public.accounts (user_id, name, type, cash_balance)
  values (auth.uid(), p_name, coalesce(p_type, 'stocks'), coalesce(p_initial_cash, 0))
  returning id into v_account_id;

  insert into public.transactions (account_id, side, cash_delta)
  values (v_account_id, 'OPENING_BALANCE', coalesce(p_initial_cash, 0));

  for v_holding in select * from jsonb_array_elements(coalesce(p_holdings, '[]'::jsonb))
  loop
    v_symbol := upper(trim(v_holding ->> 'symbol'));
    v_qty    := (v_holding ->> 'quantity')::numeric;
    v_price  := (v_holding ->> 'avg_price')::numeric;

    if v_symbol is null or v_symbol = '' or v_qty is null or v_qty <= 0 then
      continue;
    end if;

    insert into public.positions (account_id, symbol, quantity, avg_cost)
    values (v_account_id, v_symbol, v_qty, coalesce(v_price, 0))
    on conflict (account_id, symbol) do update
      set quantity = public.positions.quantity + excluded.quantity,
          avg_cost = excluded.avg_cost;

    insert into public.transactions (account_id, symbol, side, quantity, price, cash_delta)
    values (v_account_id, v_symbol, 'OPENING_BALANCE', v_qty, coalesce(v_price, 0), 0);
  end loop;

  return v_account_id;
end;
$$;

-- ============================================================================
-- execute_trade: atomic BUY/SELL with validation (long-only, no margin).
-- Price is passed by the server (which fetched it live) — not the browser.
-- ============================================================================
create or replace function public.execute_trade(
  p_account_id uuid,
  p_symbol text,
  p_side text,
  p_quantity numeric,
  p_price numeric
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_symbol   text := upper(trim(p_symbol));
  v_cash     numeric;
  v_pos_qty  numeric;
  v_pos_avg  numeric;
  v_cost     numeric;
begin
  if not public.owns_account(p_account_id) then
    raise exception 'Account not found';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be positive';
  end if;
  if p_price is null or p_price <= 0 then
    raise exception 'Invalid price';
  end if;

  select cash_balance into v_cash from public.accounts
    where id = p_account_id for update;

  select quantity, avg_cost into v_pos_qty, v_pos_avg from public.positions
    where account_id = p_account_id and symbol = v_symbol for update;

  v_cost := p_quantity * p_price;

  if p_side = 'BUY' then
    if v_cash < v_cost then
      raise exception 'Insufficient cash: need %, have %', v_cost, v_cash;
    end if;

    update public.accounts set cash_balance = cash_balance - v_cost
      where id = p_account_id;

    if v_pos_qty is null then
      insert into public.positions (account_id, symbol, quantity, avg_cost)
      values (p_account_id, v_symbol, p_quantity, p_price);
    else
      update public.positions
        set quantity = v_pos_qty + p_quantity,
            avg_cost = ((v_pos_qty * v_pos_avg) + v_cost) / (v_pos_qty + p_quantity)
        where account_id = p_account_id and symbol = v_symbol;
    end if;

    insert into public.transactions (account_id, symbol, side, quantity, price, cash_delta)
    values (p_account_id, v_symbol, 'BUY', p_quantity, p_price, -v_cost);

  elsif p_side = 'SELL' then
    if v_pos_qty is null or v_pos_qty < p_quantity then
      raise exception 'Not enough shares to sell';
    end if;

    update public.accounts set cash_balance = cash_balance + v_cost
      where id = p_account_id;

    if v_pos_qty = p_quantity then
      delete from public.positions
        where account_id = p_account_id and symbol = v_symbol;
    else
      update public.positions set quantity = v_pos_qty - p_quantity
        where account_id = p_account_id and symbol = v_symbol;
    end if;

    insert into public.transactions (account_id, symbol, side, quantity, price, cash_delta)
    values (p_account_id, v_symbol, 'SELL', p_quantity, p_price, v_cost);

  else
    raise exception 'Invalid side: %', p_side;
  end if;
end;
$$;

-- ============================================================================
-- adjust_cash: deposit more virtual cash, or reset the whole account.
-- mode 'DEPOSIT' adds p_amount; mode 'RESET' wipes positions and sets cash.
-- ============================================================================
create or replace function public.adjust_cash(
  p_account_id uuid,
  p_mode text,
  p_amount numeric
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.owns_account(p_account_id) then
    raise exception 'Account not found';
  end if;
  if coalesce(p_amount, 0) < 0 then
    raise exception 'Amount cannot be negative';
  end if;

  if p_mode = 'DEPOSIT' then
    update public.accounts set cash_balance = cash_balance + p_amount
      where id = p_account_id;
    insert into public.transactions (account_id, side, cash_delta)
    values (p_account_id, 'DEPOSIT', p_amount);

  elsif p_mode = 'RESET' then
    delete from public.positions where account_id = p_account_id;
    update public.accounts set cash_balance = p_amount where id = p_account_id;
    insert into public.transactions (account_id, side, cash_delta)
    values (p_account_id, 'RESET', p_amount);

  else
    raise exception 'Invalid mode: %', p_mode;
  end if;
end;
$$;
