/** @typedef {{fixed_fee?:number|string,per_unit_fee?:number|string,fee_bps?:number|string,minimum_fee?:number|string,half_spread_bps?:number|string,slippage_bps?:number|string}} CostProfile */
const round8=n=>Math.round(n*1e8)/1e8;
/** UI estimate only; SQL uses numeric arithmetic and server quotes.
 * @param {CostProfile|null} profile @param {'BUY'|'SELL'} side @param {number} quantity @param {number} reference @param {boolean} [limit] */
export function estimateSpot(profile,side,quantity,reference,limit=false) {
  const spread=limit?0:round8(reference*Number(profile?.half_spread_bps??0)/10000),slip=limit?0:round8(reference*Number(profile?.slippage_bps??0)/10000);
  const price=round8(reference+(side==='BUY'?1:-1)*(spread+slip));
  const fee=round8(Math.max(Number(profile?.minimum_fee??0),Number(profile?.fixed_fee??0)+quantity*Number(profile?.per_unit_fee??0)+price*quantity*Number(profile?.fee_bps??0)/10000));
  const notional=round8(quantity*price);
  return {price,fee,spreadCost:round8(spread*quantity),slippageCost:round8(slip*quantity),cash:side==='BUY'?notional+fee:notional-fee};
}
/** @param {CostProfile|null} profile @param {number} budget @param {number} reference @param {boolean} [limit] */
export function affordableSpotQuantity(profile,budget,reference,limit=false) {
  const price=estimateSpot(profile,'BUY',0,reference,limit).price;
  if(!(price>0))return 0;
  return Math.max(0,Math.min((budget-Number(profile?.minimum_fee??0))/price,(budget-Number(profile?.fixed_fee??0))/(price*(1+Number(profile?.fee_bps??0)/10000)+Number(profile?.per_unit_fee??0))));
}
