// Values come from the verified server session and local preview configuration,
// never from a requested account ID or an email address supplied by the browser.
export const portfolioQuery = `
WITH owner AS (
  SELECT l.legacy_user_id
  FROM poshkan_stage.auth_links l
  JOIN neon_auth."user" u ON u.id = l.neon_user_id
  JOIN poshkan_stage.legacy_users old ON old.id = l.legacy_user_id
  WHERE l.neon_user_id = $1::uuid AND l.neon_user_id = $2::uuid
    AND NOT coalesce(u.banned, false)
    AND (old.banned_until IS NULL OR old.banned_until <= now())
), owned_accounts AS (
  SELECT a.id, a.name, a.type, a.cash_balance
  FROM poshkan_stage.accounts a JOIN owner o ON o.legacy_user_id = a.user_id
)
SELECT
  EXISTS(SELECT 1 FROM owner) AS authorized,
  coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.name, 'type', a.type,
    'cashBalance', a.cash_balance::text,
    'holdings', (SELECT count(*) FROM poshkan_stage.positions p WHERE p.account_id = a.id),
    'openForex', (SELECT count(*) FROM poshkan_stage.fx_positions f WHERE f.account_id = a.id AND f.status = 'open'),
    'transactions', (SELECT count(*) FROM poshkan_stage.transactions t WHERE t.account_id = a.id)
  ) ORDER BY a.name, a.id) FROM owned_accounts a), '[]'::jsonb) AS accounts
`;

export const accountQuery = `
WITH owned_account AS (
  SELECT a.id, a.name, a.type, a.cash_balance
  FROM poshkan_stage.accounts a
  JOIN poshkan_stage.auth_links l ON l.legacy_user_id = a.user_id
  JOIN neon_auth."user" u ON u.id = l.neon_user_id
  JOIN poshkan_stage.legacy_users old ON old.id = l.legacy_user_id
  WHERE l.neon_user_id = $1::uuid AND l.neon_user_id = $2::uuid
    AND a.id = $3::uuid
    AND NOT coalesce(u.banned, false)
    AND (old.banned_until IS NULL OR old.banned_until <= now())
), ledger AS (
  SELECT t.* FROM poshkan_stage.transactions t JOIN owned_account a ON a.id = t.account_id
), forex AS (
  SELECT f.* FROM poshkan_stage.fx_positions f JOIN owned_account a ON a.id = f.account_id
)
SELECT jsonb_build_object(
  'id', a.id, 'name', a.name, 'type', a.type, 'cashBalance', a.cash_balance::text,
  'holdings', coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', p.id, 'symbol', p.symbol, 'quantity', p.quantity::text,
    'averageCost', p.avg_cost::text, 'costBasis', (p.quantity * p.avg_cost)::text
  ) ORDER BY p.symbol, p.id) FROM poshkan_stage.positions p WHERE p.account_id = a.id), '[]'::jsonb),
  'transactionCount', (SELECT count(*) FROM ledger),
  'transactions', coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', t.id, 'symbol', t.symbol, 'side', t.side, 'quantity', t.quantity::text,
    'price', t.price::text, 'cashDelta', t.cash_delta::text, 'createdAt', t.created_at
  ) ORDER BY t.created_at DESC, t.id DESC)
  FROM (SELECT * FROM ledger ORDER BY created_at DESC, id DESC LIMIT 50 OFFSET $4) t), '[]'::jsonb),
  'forexCount', (SELECT count(*) FROM forex),
  'forex', coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', f.id, 'symbol', f.symbol, 'direction', f.direction, 'units', f.units::text,
    'openRate', f.open_rate::text, 'margin', f.margin::text, 'status', f.status,
    'openedAt', f.opened_at, 'closedAt', f.closed_at, 'closeRate', f.close_rate::text,
    'pnl', f.pnl::text, 'stopLoss', f.stop_loss::text, 'takeProfit', f.take_profit::text
  ) ORDER BY f.opened_at DESC, f.id DESC)
  FROM (SELECT * FROM forex ORDER BY opened_at DESC, id DESC LIMIT 50 OFFSET $5) f), '[]'::jsonb)
) AS account FROM owned_account a
`;
