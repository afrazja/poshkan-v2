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
