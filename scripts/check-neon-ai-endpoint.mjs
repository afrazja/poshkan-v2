import assert from 'node:assert/strict';
const base='http://127.0.0.1:3025/api/cron/scan-opportunities';
const headers={Authorization:`Bearer ${process.env.CRON_SECRET}`};
assert.equal((await fetch(base+'?preview=1')).status,401);
const scheduled=await fetch(base,{headers});
assert.equal(scheduled.status,200);assert.match((await scheduled.json()).blocked,/disabled/);
const preview=await fetch(base+'?preview=1',{headers});
assert.equal(preview.status,200);assert.match((await preview.json()).blocked,/API key/);
console.log(JSON.stringify({passed:true,checks:['unauthorized preview rejected','repeated AI scans disabled','missing API key reported without attempting paid analysis']}));
