import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Render the actual presentation component with synthetic data only. This
// fixture does not mint a session, bypass an app guard, or expose an app route.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'src/app/neon-preview/portfolio/account-details.tsx'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const componentModule = { exports: {} };
new Function('require', 'module', 'exports', compiled)(createRequire(import.meta.url), componentModule, componentModule.exports);
const { AccountDetails } = componentModule.exports;
const account = {
  id: '00000000-0000-4000-8000-000000000001', name: 'Example portfolio', type: 'stocks', cashBalance: '10000.00000000',
  holdings: [{ id: 'holding', symbol: 'EXAMPLE', quantity: '0.00000001', averageCost: '123.45678900', costBasis: '0.00000123456789' }],
  transactionCount: 52,
  transactions: [{ id: 'trade', symbol: 'EXAMPLE', side: 'BUY', quantity: '0.00000001', price: '123.45678900', cashDelta: '-0.00000123456789', createdAt: '2026-09-18T10:20:00Z' }],
  forexCount: 1,
  forex: [{ id: 'fx', symbol: 'EURUSD=X', direction: 'LONG', units: '10000.00', openRate: '1.100000', margin: '100.00', status: 'closed', openedAt: '2026-09-17T10:00:00Z', closedAt: '2026-09-18T10:00:00Z', closeRate: '1.101000', pnl: '10.00', stopLoss: null, takeProfit: '1.101000' }],
};
const render = (data, transactionPage = 1) => renderToStaticMarkup(React.createElement(AccountDetails, { account: data, transactionPage, forexPage: 1 }));
const html = render(account);
assert.ok(html.includes('0.00000001') && html.includes('−$0.00000123456789'), 'Fractional shares/cash must not round to zero');
assert.ok(html.includes('transactions=2&amp;forex=1#transactions'), 'Ledger next-page link must preserve other history page');
assert.ok(html.includes('18 Sept 2026, 10:20'), 'Dates must be stable UTC');
assert.ok(html.includes('closed') && html.includes('Realized P&amp;L'));
assert.ok(render(account, 2).includes('Previous'));
const empty = render({ ...account, holdings: [], transactions: [], forex: [], transactionCount: 0, forexCount: 0 });
assert.ok(empty.includes('No transactions') && empty.includes('No forex positions') && empty.includes('No stock or crypto holdings'));
assert.ok(!empty.includes('>Next</a>') && !empty.includes('>Previous</a>'));
const chunkDirectory = path.join(root, '.next/static/chunks');
const styles = (await readdir(chunkDirectory)).filter(file => file.endsWith('.css'));
const css = (await Promise.all(styles.map(file => readFile(path.join(chunkDirectory, file), 'utf8')))).join('\n');
const output = path.resolve(root, '../poshkan-neon-migration/generated/account-details-fixture.html');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `<!doctype html><html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Poshkan details — synthetic UI check</title><style>${css}</style></head><body><main class="min-h-screen bg-slate-950 px-6 py-12 text-slate-100"><div class="mx-auto max-w-4xl"><p class="mb-8 text-teal-300">UI TEST · SYNTHETIC DATA</p>${html}</div></main></body></html>`);
console.log('PASS: exact fractional amounts, UTC dates, pagination links, forex history and empty states. Synthetic browser fixture rendered.');
