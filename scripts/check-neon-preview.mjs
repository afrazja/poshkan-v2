import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import ts from 'typescript';

// Exercise the actual query against the staged copy without creating a login
// session. This validates database scoping, not the user's end-to-end sign-in.
const source = await readFile(new URL('../src/lib/neon-preview/portfolio-query.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { portfolioQuery, accountQuery } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const connection = new pg.Client({
  connectionString: process.env.NEON_PREVIEW_DATABASE_URL,
  connectionTimeoutMillis: 15000,
  options: '-c default_transaction_read_only=on -c statement_timeout=15000',
});
try {
  await connection.connect();
  assert.equal((await connection.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only, 'on');
  await connection.query('BEGIN READ ONLY');
  const owner = process.env.NEON_PREVIEW_USER_ID;
  const stranger = '00000000-0000-4000-8000-000000000001';
  const valid = (await connection.query(portfolioQuery, [owner, owner])).rows[0];
  assert.equal(valid.authorized, true);
  const expected = await connection.query(`SELECT a.id FROM poshkan_stage.accounts a
    JOIN poshkan_stage.auth_links l ON l.legacy_user_id = a.user_id WHERE l.neon_user_id = $1`, [owner]);
  assert.deepEqual(valid.accounts.map(a => a.id).sort(), expected.rows.map(a => a.id).sort());
  assert.ok(valid.accounts.length > 0);
  for (const params of [[stranger, owner], [owner, stranger], [null, owner], [owner, null]]) {
    const denied = (await connection.query(portfolioQuery, params)).rows[0];
    assert.equal(denied.authorized, false);
    assert.deepEqual(denied.accounts, []);
    assert.equal((await connection.query(accountQuery, [...params, valid.accounts[0].id, 0, 0])).rows.length, 0);
  }
  for (const summary of valid.accounts) {
    const detail = (await connection.query(accountQuery, [owner, owner, summary.id, 0, 0])).rows[0].account;
    assert.equal(detail.id, summary.id);
    assert.equal(detail.cashBalance, summary.cashBalance);
    const holdings = (await connection.query('SELECT id, quantity::text, avg_cost::text FROM poshkan_stage.positions WHERE account_id = $1 ORDER BY symbol, id', [summary.id])).rows;
    assert.deepEqual(detail.holdings.map(p => [p.id, p.quantity, p.averageCost]), holdings.map(p => [p.id, p.quantity, p.avg_cost]));
    const ledger = (await connection.query('SELECT id, cash_delta::text, quantity::text, price::text FROM poshkan_stage.transactions WHERE account_id = $1 ORDER BY created_at DESC, id DESC', [summary.id])).rows;
    const forex = (await connection.query('SELECT id, units::text, open_rate::text, margin::text, pnl::text FROM poshkan_stage.fx_positions WHERE account_id = $1 ORDER BY opened_at DESC, id DESC', [summary.id])).rows;
    assert.equal(detail.transactionCount, ledger.length);
    assert.equal(detail.forexCount, forex.length);
    const ledgerPages = [];
    const forexPages = [];
    for (let offset = 0; offset < Math.max(1, ledger.length, forex.length); offset += 50) {
      const page = (await connection.query(accountQuery, [owner, owner, summary.id, offset, offset])).rows[0].account;
      assert.ok(page.transactions.length <= 50 && page.forex.length <= 50);
      ledgerPages.push(...page.transactions);
      forexPages.push(...page.forex);
    }
    assert.deepEqual(ledgerPages.map(t => [t.id, t.cashDelta, t.quantity, t.price]), ledger.map(t => [t.id, t.cash_delta, t.quantity, t.price]));
    assert.deepEqual(forexPages.map(f => [f.id, f.units, f.openRate, f.margin, f.pnl]), forex.map(f => [f.id, f.units, f.open_rate, f.margin, f.pnl]));
  }
  const foreignAccount = (await connection.query(`SELECT a.id FROM poshkan_stage.accounts a
    WHERE a.user_id <> (SELECT legacy_user_id FROM poshkan_stage.auth_links WHERE neon_user_id = $1) LIMIT 1`, [owner])).rows[0];
  assert.ok(foreignAccount, 'Need an unrelated account to prove account-ID tampering is denied');
  for (const accountId of [stranger, foreignAccount.id]) {
    assert.equal((await connection.query(accountQuery, [owner, owner, accountId, 0, 0])).rows.length, 0);
  }
  const access = await connection.query('SELECT application_access_enabled FROM poshkan_stage.auth_links WHERE neon_user_id = $1', [owner]);
  assert.equal(access.rows[0].application_access_enabled, false);
  await connection.query('ROLLBACK');
  console.log('PASS: read-only connection; exact owner portfolios, holdings and paginated ledger/forex records; missing/unrelated identities and foreign account IDs denied; production access stays disabled.');
} catch (error) {
  console.error('Preview database verification failed:', error.code || error.name);
  process.exitCode = 1;
} finally {
  await connection.end();
}
