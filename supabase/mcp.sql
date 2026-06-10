-- ============================================================================
-- Claude/MCP API access (run AFTER hardening.sql).
-- 1) Personal API tokens (hashed) that let an AI assistant act for a user.
-- 2) execute_trade becomes callable by the service role (the MCP server
--    verifies account ownership in code), with the same anon lockdown the
--    forex RPCs received in hardening.sql.
-- ============================================================================

create table if not exists public.api_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  name         text not null,
  token_hash   text not null unique,        -- sha256 of the token; plaintext never stored
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists api_tokens_user_idx on public.api_tokens (user_id);

alter table public.api_tokens enable row level security;
drop policy if exists "api_tokens_all_own" on public.api_tokens;
create policy "api_tokens_all_own" on public.api_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- execute_trade: allow service-role callers (auth.uid() IS NULL) — the MCP
-- server and crons verify ownership in application code before calling.
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
  if auth.uid() is not null and not public.owns_account(p_account_id) then
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
  if v_cash is null then
    raise exception 'Account not found';
  end if;

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

-- Same lockdown as the forex RPCs: the NULL-auth.uid() path must never be
-- reachable by the anon role.
revoke execute on function public.execute_trade(uuid, text, text, numeric, numeric) from public, anon;
grant execute on function public.execute_trade(uuid, text, text, numeric, numeric) to authenticated, service_role;
