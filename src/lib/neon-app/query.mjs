// Server-side translation of the existing PostgREST query builder. No HTTP SQL
// endpoint is exposed. SQL identifiers are validated; all values are parameters.
const identifier = value => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('Unsupported query identifier');
  return `"${value}"`;
};
const tables = new Set(['accounts','positions','transactions','fx_positions','orders','fx_orders','fx_tp_levels','profiles','watchlist','alerts','account_snapshots','notifications','custom_strategies','custom_strategy_signals','smc_settings','smc_signals','ote_settings','ote_signals','trend_settings','trend_signals','meanrev_settings','meanrev_signals','candlerange_settings','candlerange_signals','api_tokens','push_subscriptions','email_prefs']);
const cacheTables = new Set(['market_quotes','market_candles','market_data_syncs','market_scans']);
const serviceTables = new Set([...tables, ...cacheTables, 'fx_scan_alerts', 'crypto_monitor_runs', 'delivery_captures']);

/** @param {import('pg').PoolClient} client @param {URL} url @param {RequestInit} init */
export async function executeQuery(client, url, init = {}, scope = 'app') {
  const table = url.pathname.split('/').pop();
  const allowed = scope === 'cache' ? cacheTables : scope === 'services' ? serviceTables : tables;
  if (!allowed.has(table)) throw new Error('Unsupported application table');
  const target = `poshkan_trade_test.${identifier(table)}`;
  const params = [];
  const bind = value => { params.push(value); return `$${params.length}`; };
  const bindColumn=(key,value)=>bind(['rules','last_backtest','quote','results','report','payload'].includes(key)&&value!==null?JSON.stringify(value):value);
  const search = url.searchParams;
  const filters = [];
  let join = '';
  let selection = search.get('select') || '*';
  if (table === 'fx_tp_levels' && selection.includes('fx_positions!inner(account_id)')) {
    selection = selection.replace(',fx_positions!inner(account_id)', '');
    join = ' JOIN poshkan_trade_test.fx_positions AS fx_positions ON fx_positions.id=t.position_id';
  }
  const column = name => name.startsWith('fx_positions.') && join ? `fx_positions.${identifier(name.slice(13))}` : `t.${identifier(name)}`;
  for (const [key, value] of search) {
    if (['select','order','limit','offset','on_conflict','columns'].includes(key)) continue;
    const dot = value.indexOf('.');
    const op = value.slice(0,dot), val = value.slice(dot+1), col = column(key);
    const ops = {eq:'=',neq:'<>',gt:'>',gte:'>=',lt:'<',lte:'<=',like:'LIKE',ilike:'ILIKE'};
    if (op in ops) filters.push(`${col} ${ops[op]} ${bind(val)}`);
    else if (op === 'is' && ['null','true','false'].includes(val)) filters.push(`${col} IS ${val.toUpperCase()}`);
    else if (op === 'in' && val.startsWith('(') && val.endsWith(')')) {
      const values = val.slice(1,-1).match(/"(?:\\.|[^"\\])*"|[^,]+/g) || [];
      filters.push(values.length ? `${col} IN (${values.map(v=>bind(v.startsWith('"')?JSON.parse(v):v)).join(',')})` : 'false');
    } else throw new Error('Unsupported query filter');
  }
  const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
  const projection = selection === '*' ? 't.*' : selection.split(',').map(column).join(',');
  const method = (init.method || 'GET').toUpperCase();
  let sql;
  if (method === 'GET' || method === 'HEAD') {
    sql = `SELECT ${projection} FROM ${target} AS t${join}${where}`;
    const order = search.get('order');
    if (order) sql += ' ORDER BY ' + order.split(',').map(v=> {
      const [name,direction='asc',nulls] = v.split('.');
      if (!['asc','desc'].includes(direction) || (nulls && !['nullsfirst','nullslast'].includes(nulls))) throw new Error('Invalid sort');
      return `${column(name)} ${direction.toUpperCase()}${nulls ? nulls==='nullsfirst'?' NULLS FIRST':' NULLS LAST':''}`;
    }).join(',');
    for (const [key,keyword] of [['limit','LIMIT'],['offset','OFFSET']]) {
      if (search.has(key)) {
        const value = search.get(key);
        if (!/^\d{1,8}$/.test(value)) throw new Error('Invalid pagination');
        sql += ` ${keyword} ${bind(Number(value))}`;
      }
    }
  } else {
    if (join) throw new Error('Mutation joins are not supported');
    const body = JSON.parse(String(init.body || '{}'));
    if (method === 'PATCH') {
      const entries = Object.entries(body);
      if (!entries.length || !filters.length) throw new Error('A scoped update is required');
      sql = `UPDATE ${target} AS t SET ${entries.map(([k,v])=>`${identifier(k)}=${bindColumn(k,v)}`).join(',')}${where} RETURNING ${projection}`;
    } else if (method === 'DELETE') {
      if (!filters.length) throw new Error('A scoped delete is required');
      sql = `DELETE FROM ${target} AS t${where} RETURNING ${projection}`;
    } else if (method === 'POST') {
      const rows = Array.isArray(body) ? body : [body];
      if (!rows.length || rows.length>1000) throw new Error('Invalid insert');
      const columns = Object.keys(rows[0]);
      if (!columns.length || rows.some(row=>Object.keys(row).join()!==columns.join())) throw new Error('Invalid insert columns');
      sql = `INSERT INTO ${target} AS t (${columns.map(identifier).join(',')}) VALUES ${rows.map(row=>`(${columns.map(c=>bindColumn(c,row[c])).join(',')})`).join(',')}`;
      const prefer = new Headers(init.headers).get('Prefer') || '';
      if (prefer.includes('resolution=')) {
        const conflict = (search.get('on_conflict') || 'id').split(',');
        sql += ` ON CONFLICT (${conflict.map(identifier).join(',')}) `;
        const updates=columns.filter(c=>!conflict.includes(c));
        sql += prefer.includes('ignore-duplicates') || !updates.length ? 'DO NOTHING' : `DO UPDATE SET ${updates.map(c=>`${identifier(c)}=EXCLUDED.${identifier(c)}`).join(',')}`;
      }
      sql += ` RETURNING ${projection}`;
    } else throw new Error('Unsupported query operation');
  }
  const result = await client.query(sql,params);
  for (const field of result.fields) {
    if ([20,700,701,1700].includes(field.dataTypeID)) for (const row of result.rows) if(row[field.name]!==null) row[field.name]=Number(row[field.name]);
    if(field.dataTypeID===1082) for(const row of result.rows) {
      const d=row[field.name];
      if(d instanceof Date) row[field.name]=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
  }
  const headers = new Headers(init.headers);
  const single = headers.get('Accept')?.includes('vnd.pgrst.object');
  if (single && result.rows.length!==1) return Response.json({message:'Record not found',code:'PGRST116',details:`The result contains ${result.rows.length} rows`},{status:406});
  // pg JSON conversion preserves exact numerics as JSON numbers like PostgREST;
  // the trading engine continues to use numeric arithmetic inside PostgreSQL.
  const count = headers.get('Prefer')?.includes('count=exact') ? (await client.query(`SELECT count(*)::int AS n FROM ${target} AS t${join}${where}`,params.slice(0,filters.reduce((n,f)=>n+(f.match(/\$\d+/g)||[]).length,0)))).rows[0].n : result.rows.length;
  return new Response(method==='HEAD'?null:JSON.stringify(single?result.rows[0]:result.rows),{status:200,headers:{'Content-Type':'application/json','Content-Range':`0-${Math.max(0,result.rows.length-1)}/${count}`}});
}
