import type { Transaction } from "./types";

// Realized P&L = the gains/losses locked in by sells, using the weighted-average
// cost of the shares at the moment of each sale. Reconstructed from the ledger,
// so no extra storage is needed. A RESET starts the account fresh (realized = 0).
export function realizedPnl(transactions: Transaction[]): number {
  const txns = [...transactions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const pos: Record<string, { qty: number; avgCost: number }> = {};
  let realized = 0;

  for (const t of txns) {
    if (t.side === "RESET") {
      for (const k of Object.keys(pos)) delete pos[k];
      realized = 0;
      continue;
    }
    if (!t.symbol) continue; // cash-only rows
    const qty = Number(t.quantity);
    const price = Number(t.price);
    const cur = pos[t.symbol] ?? { qty: 0, avgCost: 0 };

    if (t.side === "SELL") {
      realized += qty * (price - cur.avgCost);
      cur.qty -= qty;
      if (cur.qty <= 1e-9) delete pos[t.symbol];
      else pos[t.symbol] = cur;
    } else {
      // BUY or OPENING_BALANCE holding — update weighted-average cost.
      const newQty = cur.qty + qty;
      cur.avgCost = newQty > 0 ? (cur.qty * cur.avgCost + qty * price) / newQty : 0;
      cur.qty = newQty;
      pos[t.symbol] = cur;
    }
  }

  return realized;
}
