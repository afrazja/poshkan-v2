/** Account spot ledger review. No annualization or fabricated prior history.
 * @param {Array<{id?:string,symbol?:string|null,side:string,quantity:number|string,price:number|string,created_at:string,cash_delta?:number|string,explicit_fee?:number|string,spread_cost?:number|string,slippage_cost?:number|string,realized_pnl?:number|string|null}>} transactions */
export function reviewLedger(transactions) {
  // Stable sort keeps database ordering for sub-millisecond timestamps.
  const rows=[...transactions].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
  const positions=new Map();
  let netRealized=0,explicitFees=0,spreadCost=0,slippageCost=0,sales=0,wins=0,unknownSales=0,since=null;
  for(const t of rows) {
    if(t.side==='RESET') {positions.clear();netRealized=explicitFees=spreadCost=slippageCost=sales=wins=unknownSales=0;since=t.created_at;continue;}
    if(!t.symbol || !['BUY','SELL','OPENING_BALANCE'].includes(t.side))continue;
    if(!since)since=t.created_at;
    const qty=Number(t.quantity),price=Number(t.price),fee=Number(t.explicit_fee??0);
    if(!(qty>0) || !Number.isFinite(price))continue;
    explicitFees+=fee;spreadCost+=Number(t.spread_cost??0);slippageCost+=Number(t.slippage_cost??0);
    const p=positions.get(t.symbol)??{qty:0,basis:0};
    if(t.side==='SELL') {
      let pnl=t.realized_pnl!=null?Number(t.realized_pnl):p.qty+1e-8>=qty?qty*(price-p.basis)-fee:null;
      if(pnl===null)unknownSales++;
      else {netRealized+=pnl;sales++;if(pnl>0)wins++;}
      p.qty=Math.max(0,p.qty-qty);
    } else {p.basis=(p.qty*p.basis+qty*price+fee)/(p.qty+qty);p.qty+=qty;}
    positions.set(t.symbol,p);
  }
  return {netRealized,explicitFees,spreadCost,slippageCost,sales,profitableSales:wins,unknownSales,since};
}
