import pg from 'pg';
import { readFileSync } from 'node:fs';
const client=new pg.Client({connectionString:process.env.NEON_PREVIEW_DATABASE_URL,connectionTimeoutMillis:15000});
const password=process.env.NEON_NEW_WORKER_PASSWORD;
if(!password || !/^[A-Za-z0-9+/=]{40,100}$/.test(password)) throw new Error('Worker provisioning configuration missing');
try {
  await client.connect();
  // One-time schema/role setup refuses existing objects. Owner credentials are
  // used only here; the long-running process receives the worker login instead.
  await client.query(readFileSync(new URL('../neon/worker-preview-setup.sql',import.meta.url),'utf8'));
  await client.query(readFileSync(new URL('../neon/worker-engine.sql',import.meta.url),'utf8'));
  await client.query('BEGIN');
  await client.query("SELECT set_config('poshkan.worker_password',$1,true)",[password]);
  await client.query("DO $$ BEGIN EXECUTE format('ALTER ROLE poshkan_preview_worker LOGIN PASSWORD %L',current_setting('poshkan.worker_password')); END $$");
  await client.query('COMMIT');
  console.log('Restricted worker login provisioned; background checks remain disabled.');
} catch(error) {
  await client.query('ROLLBACK').catch(()=>{});
  console.error('Worker provisioning failed:',error.code??error.name);
  process.exitCode=1;
} finally {await client.end();}
