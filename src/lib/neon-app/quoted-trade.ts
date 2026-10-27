import type { PoolClient } from 'pg';
import { databaseSchema } from './schema.mjs';

// Compatibility with deployments before the additive migration. Only spot
// execution changes; leveraged positions retain the existing engine.
export async function quotedTrade(c: PoolClient, request: string, command: {action: string}, price: string, at: Date | undefined) {
  const schema=databaseSchema();
  const ready=command.action==='SPOT' && (await c.query('SELECT to_regprocedure($1) IS NOT NULL AS ready',[`${schema}.quoted_spot(uuid,jsonb,numeric,timestamp with time zone)`])).rows[0].ready;
  return (await c.query(ready ? `SELECT ${schema}.quoted_spot($1,$2,$3,$4) AS result` : `SELECT ${schema}.command($1,$2,$3) AS result`, ready ? [request,command,price,at??null] : [request,command,price])).rows[0].result as Record<string,string>;
}
