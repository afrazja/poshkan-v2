import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(join(root,'src/app/neon-preview/trading/trading-form.tsx'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const actualRequire=createRequire(import.meta.url);
const componentModule={exports:{}};
new Function('require','module','exports',compiled)(name => {
  if(name==='next/navigation') return {useRouter:()=>({refresh(){}})};
  if(name==='./actions') return {trade:()=>{throw new Error('Static fixture must never execute trades');}};
  return actualRequire(name);
},componentModule,componentModule.exports);
const accounts=[{id:'00000000-0000-4000-8000-000000000001',name:'Example stocks',type:'stocks',cash:'1000.00',holdings:[],forex:[]}];
let html=renderToStaticMarkup(React.createElement(componentModule.exports.TradingForm,{accounts}));
assert.ok(html.includes('Execute test trade') && html.includes('BUY') && html.includes('SELL') && html.includes('Close position (full or partial)'));
assert.ok(!html.includes('name="price"'),'Browser must not supply an execution price');
const orderSource=readFileSync(join(root,'src/app/neon-preview/trading/order-controls.tsx'),'utf8');
const orderCompiled=ts.transpileModule(orderSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const state={orders:[{id:'00000000-0000-4000-8000-000000000002',accountId:accounts[0].id,kind:'LIMIT',symbol:'AAPL',direction:'BUY',quantity:'2',target:'100',status:'pending',error:null,created:'2026-09-19T00:00:00Z',expires:null,fillPrice:null}],exits:[]};
for(const operation of ['PLACE_LIMIT','PLACE_ENTRY','SET_TIMER','SET_LEVELS']) {
  const orderModule={exports:{}};
  new Function('require','module','exports',orderCompiled)(name=>{
    if(name==='next/navigation') return {useRouter:()=>({refresh(){}})};
    if(name==='./actions') return {order:()=>{throw new Error('Inactive fixture');},runOrderChecks:()=>{throw new Error('Inactive fixture');}};
    if(name==='react') return {...React,useState:initial=>React.useState(initial==='PLACE_LIMIT'?operation:initial)};
    return actualRequire(name);
  },orderModule,orderModule.exports);
  const rendered=renderToStaticMarkup(React.createElement(orderModule.exports.OrderControls,{accounts,state}));
  assert.ok(rendered.includes('Check now')&&rendered.includes('Cancel order'));
  assert.ok(!rendered.includes('name="price"'),'The order form must not accept execution prices');
  if(operation==='PLACE_ENTRY') assert.ok(rendered.includes('AT_OR_BELOW')&&rendered.includes('name="stopLoss"'));
  if(operation==='SET_TIMER') assert.ok(rendered.includes('name="minutes"'));
  if(operation==='SET_LEVELS') assert.ok(rendered.includes('name="price2"')&&rendered.includes('name="units2"'));
  if(operation==='PLACE_LIMIT') html+=rendered;
}
const backgroundSource=readFileSync(join(root,'src/app/neon-preview/trading/background-controls.tsx'),'utf8');
const backgroundCompiled=ts.transpileModule(backgroundSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const backgroundModule={exports:{}};
new Function('require','module','exports',backgroundCompiled)(name=>{
  if(name==='next/navigation') return {useRouter:()=>({refresh(){}})};
  if(name==='./actions') return {};
  return actualRequire(name);
},backgroundModule,backgroundModule.exports);
for(const enabled of [false,true]) {
  const rendered=renderToStaticMarkup(React.createElement(backgroundModule.exports.BackgroundControls,{initial:{enabled,online:true,lastSeen:'2026-09-19T00:00:00Z',lastCheck:null,summary:null}}));
  assert.ok(rendered.includes(enabled?'Stop background checks':'Start background checks'));
  assert.ok(rendered.includes('while this PC is awake'));
  if(!enabled) html+=rendered;
}
const styles=readdirSync(join(root,'.next/static/chunks')).filter(f=>f.endsWith('.css')).map(f=>readFileSync(join(root,'.next/static/chunks',f),'utf8')).join('\n');
writeFileSync(resolve(root,'../poshkan-neon-migration/generated/trading-ui-fixture.html'),`<!doctype html><html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trading controls — synthetic visual check</title><style>${styles}</style></head><body><main class="min-h-screen bg-slate-950 px-6 py-12 text-slate-100"><div class="mx-auto max-w-4xl"><p class="mb-5 text-teal-300">UI TEST · SYNTHETIC DATA · CONTROLS INACTIVE</p><h1 class="mb-7 text-3xl">Trading test</h1>${html}</div></main></body></html>`);
console.log('PASS: actual trading and all four order/exit forms rendered with synthetic data; explicit start/stop controls; no client execution-price input.');
