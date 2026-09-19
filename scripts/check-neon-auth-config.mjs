import pg from 'pg';
const c=new pg.Client({connectionString:process.env.NEON_PREVIEW_DATABASE_URL});
try {
  await c.connect();
  const {rows}=await c.query(`SELECT
    EXISTS(SELECT 1 FROM neon_auth."user" u WHERE u.id::text=$1 AND NOT coalesce(u.banned,false)) AS account_enabled,
    EXISTS(SELECT 1 FROM neon_auth.account a WHERE to_jsonb(a)->>'userId'=$1 AND to_jsonb(a)->>'providerId'='credential' AND nullif(to_jsonb(a)->>'password','') IS NOT NULL) AS password_configured,
    EXISTS(SELECT 1 FROM poshkan_trade_test.auth_links WHERE neon_user_id::text=$1 AND application_access_enabled) AS test_mapping_enabled`,[process.env.NEON_PREVIEW_USER_ID]);
  console.log(JSON.stringify(rows[0]));
} finally {await c.end();}
