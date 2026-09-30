import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
// Generate a reviewable SQL artifact only. This script has no DB connection.
// Existing engine files retain their rehearsal schema for fixture tests.
export function researchUpgrade(production=false) {
  const files=['neon/research-costs.sql','neon/trading-engine.sql','neon/orders-engine.sql'];
  let sql='-- Generated additive research/spot-cost upgrade. Do not apply without release review.\nBEGIN;\n';
  for(const file of files)sql+=`\n-- Source: ${file}\n`+readFileSync(file,'utf8').replace(/^BEGIN;\s*/m,'').replace(/^COMMIT;\s*/m,'');
  sql+='\nCOMMIT;\n';
  return production?sql.replaceAll('poshkan_trade_test','poshkan_live').replaceAll('poshkan_trade_preview','poshkan_live_app'):sql;
}
if(resolve(process.argv[1]??'')===fileURLToPath(import.meta.url)) {
  const production=process.argv.includes('--production');
  const output=production?'neon/research-upgrade-live.sql':'neon/research-upgrade-test.sql';
  writeFileSync(output,researchUpgrade(production));console.log(`Wrote ${output}; no database was contacted.`);
}
