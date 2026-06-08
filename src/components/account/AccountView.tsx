"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Account, Position, WatchlistItem } from "@/lib/types";
import { useQuotes } from "@/lib/useQuotes";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  changeColor,
} from "@/lib/format";
import SymbolSearch from "@/components/SymbolSearch";
import SymbolPanel from "./SymbolPanel";
import Sparkline from "./Sparkline";
import HoldingsTable from "./HoldingsTable";
import WatchlistTable from "./WatchlistTable";
import TradeModal from "./TradeModal";
import CashModal from "./CashModal";
import {
  addToWatchlistAction,
  removeFromWatchlistAction,
} from "@/app/dashboard/[accountId]/actions";

export default function AccountView({
  account,
  initialPositions,
  initialWatchlist,
}: {
  account: Account;
  initialPositions: Position[];
  initialWatchlist: WatchlistItem[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ symbol: string; name: string } | null>(null);
  const [trade, setTrade] = useState<{ side: "BUY" | "SELL"; symbol: string } | null>(null);
  const [cashModal, setCashModal] = useState<"DEPOSIT" | "RESET" | null>(null);

  const positions = initialPositions;
  const watchlist = initialWatchlist;

  // Symbols to keep priced live.
  const symbols = useMemo(() => {
    const s = new Set<string>();
    positions.forEach((p) => s.add(p.symbol.toUpperCase()));
    watchlist.forEach((w) => s.add(w.symbol.toUpperCase()));
    if (selected) s.add(selected.symbol.toUpperCase());
    return Array.from(s);
  }, [positions, watchlist, selected]);

  const { data: quotes = {} } = useQuotes(symbols);

  // Portfolio aggregates.
  const holdingsValue = positions.reduce((sum, p) => {
    const q = quotes[p.symbol.toUpperCase()];
    return sum + Number(p.quantity) * (q?.price ?? Number(p.avg_cost));
  }, 0);
  const costBasis = positions.reduce(
    (sum, p) => sum + Number(p.quantity) * Number(p.avg_cost),
    0
  );
  const cash = Number(account.cash_balance);
  const totalValue = cash + holdingsValue;
  const totalPnl = holdingsValue - costBasis;
  const totalPnlPct = costBasis > 0 ? (totalPnl / costBasis) * 100 : 0;

  const todayPnl = positions.reduce((sum, p) => {
    const q = quotes[p.symbol.toUpperCase()];
    if (!q) return sum;
    return sum + Number(p.quantity) * (q.price - q.previousClose);
  }, 0);

  const heldFor = (symbol: string) =>
    Number(positions.find((p) => p.symbol.toUpperCase() === symbol.toUpperCase())?.quantity ?? 0);
  const inWatchlist = (symbol: string) =>
    watchlist.some((w) => w.symbol.toUpperCase() === symbol.toUpperCase());

  async function toggleWatch(symbol: string) {
    if (inWatchlist(symbol)) {
      await removeFromWatchlistAction(account.id, symbol);
    } else {
      await addToWatchlistAction(account.id, symbol);
    }
    router.refresh();
  }

  const selectedQuote = selected ? quotes[selected.symbol.toUpperCase()] : undefined;
  const tradePrice = trade ? quotes[trade.symbol.toUpperCase()]?.price ?? 0 : 0;

  // Mini sparkline history for the Holdings value and Total P&L metrics.
  // Refetches when the set of holdings changes (e.g. after a trade).
  const [spark, setSpark] = useState<{ holdings: number[]; pnl: number[] }>({ holdings: [], pnl: [] });
  const posSig = positions.map((p) => `${p.symbol}:${p.quantity}`).join(",");
  useEffect(() => {
    if (positions.length === 0) {
      setSpark({ holdings: [], pnl: [] });
      return;
    }
    let active = true;
    fetch(`/api/holdings-history?accountId=${account.id}&range=1M`)
      .then((r) => r.json())
      .then((j) => {
        if (!active || j.error) return;
        setSpark({
          holdings: (j.holdings ?? []).map((p: { value: number }) => p.value),
          pnl: (j.pnl ?? []).map((p: { value: number }) => p.value),
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id, posSig]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-muted hover:text-foreground">
          ← All accounts
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => setCashModal("DEPOSIT")}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-card"
          >
            Add cash
          </button>
          <button
            onClick={() => setCashModal("RESET")}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:bg-card"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">{account.name}</h1>
            <span className="text-xs capitalize text-muted">{account.type} account</span>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{formatCurrency(totalValue)}</div>
            <div className="text-xs text-muted">total account value</div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Buying power" value={formatCurrency(cash)} />
          <Stat
            label="Holdings value"
            value={formatCurrency(holdingsValue)}
            sparkline={
              spark.holdings.length >= 2 ? (
                <Sparkline points={spark.holdings} colorMode="trend" />
              ) : undefined
            }
          />
          <Stat
            label="Today's P&L"
            value={formatSignedCurrency(todayPnl)}
            colorClass={changeColor(todayPnl)}
          />
          <Stat
            label="Total P&L"
            value={`${formatSignedCurrency(totalPnl)} (${formatPercent(totalPnlPct)})`}
            colorClass={changeColor(totalPnl)}
            sparkline={
              spark.pnl.length >= 2 ? <Sparkline points={spark.pnl} colorMode="pnl" /> : undefined
            }
          />
        </div>
      </div>

      {/* Search */}
      <div>
        <SymbolSearch onSelect={(r) => setSelected({ symbol: r.symbol, name: r.name })} />
      </div>

      {/* Selected symbol panel */}
      {selected && (
        <SymbolPanel
          symbol={selected.symbol}
          name={selected.name}
          liveQuote={selectedQuote}
          heldShares={heldFor(selected.symbol)}
          inWatchlist={inWatchlist(selected.symbol)}
          onBuy={() => setTrade({ side: "BUY", symbol: selected.symbol })}
          onSell={() => setTrade({ side: "SELL", symbol: selected.symbol })}
          onToggleWatch={() => toggleWatch(selected.symbol)}
        />
      )}

      {/* Holdings */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Holdings</h2>
        <HoldingsTable
          positions={positions}
          quotes={quotes}
          onSelect={(symbol) => setSelected({ symbol, name: symbol })}
        />
      </section>

      {/* Watchlist */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Watchlist</h2>
        <WatchlistTable
          items={watchlist}
          quotes={quotes}
          onSelect={(symbol) => setSelected({ symbol, name: symbol })}
          onRemove={(symbol) => toggleWatch(symbol)}
        />
      </section>

      {trade && (
        <TradeModal
          accountId={account.id}
          symbol={trade.symbol}
          side={trade.side}
          price={tradePrice}
          cash={cash}
          maxShares={heldFor(trade.symbol)}
          onClose={() => setTrade(null)}
        />
      )}
      {cashModal && (
        <CashModal accountId={account.id} mode={cashModal} onClose={() => setCashModal(null)} />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  colorClass,
  sparkline,
}: {
  label: string;
  value: string;
  colorClass?: string;
  sparkline?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 flex items-center gap-2">
        {sparkline}
        <span className={`font-semibold ${colorClass ?? ""}`}>{value}</span>
      </div>
    </div>
  );
}
