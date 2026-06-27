"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FxPosition, Quote } from "@/lib/types";
import { formatCurrency, formatSignedCurrency, formatPercent, changeColor } from "@/lib/format";
import { floatingPnl, marginFor, FX_LEVERAGE } from "@/lib/forex";
import { openFxPositionAction, closeFxPositionAction } from "@/app/dashboard/[accountId]/actions";
import SymbolSearch from "@/components/SymbolSearch";
import Modal from "@/components/Modal";

// Leveraged long/short positions for stock & crypto accounts — the same engine
// as forex (margin, SL/TP, stop-out), surfaced for these markets so the user can
// short. Coexists with the account's buy-and-hold holdings.
export default function LeveragePanel({
  accountId,
  accountType,
  cash,
  leverage = FX_LEVERAGE,
  positions,
  quotes,
}: {
  accountId: string;
  accountType: string;
  cash: number;
  leverage?: number;
  positions: FxPosition[];
  quotes: Record<string, Quote>;
}) {
  const router = useRouter();
  const [open, setOpenModal] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);

  const live = positions.filter((p) => p.status === "open");
  const unit = accountType === "crypto" ? "coins" : "shares";

  async function close(id: string) {
    setClosing(id);
    await closeFxPositionAction(id, accountId);
    setClosing(null);
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Long / Short positions</h2>
          <p className="text-xs text-muted">Leverage {leverage}:1 · margin from cash · short to profit when price falls</p>
        </div>
        <button
          onClick={() => setOpenModal(true)}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          + Open position
        </button>
      </div>

      {live.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
          No open long/short positions. Use “Open position” to go long or short with leverage.
        </p>
      ) : (
        <div className="space-y-2">
          {live.map((p) => {
            const q = quotes[p.symbol.toUpperCase()];
            const rate = q?.price;
            const fl = rate ? floatingPnl(p.direction, Number(p.units), Number(p.open_rate), rate, p.symbol) : null;
            const pct =
              rate && Number(p.open_rate) > 0
                ? ((rate - Number(p.open_rate)) / Number(p.open_rate)) * 100 * (p.direction === "SHORT" ? -1 : 1)
                : null;
            return (
              <div key={p.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {p.symbol}{" "}
                    <span
                      className={`ml-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                        p.direction === "LONG" ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
                      }`}
                    >
                      {p.direction === "LONG" ? "Long" : "Short"}
                    </span>
                  </span>
                  <span className={`font-medium ${fl != null ? changeColor(fl) : ""}`}>
                    {fl != null ? formatSignedCurrency(fl) : "…"}
                    {pct != null && <span className="ml-1 text-xs">({formatPercent(pct)})</span>}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span>
                    {Number(p.units).toLocaleString("en-US")} {unit} · {formatCurrency(Number(p.open_rate))} →{" "}
                    {rate ? formatCurrency(rate) : "…"} · margin {formatCurrency(Number(p.margin))}
                    {p.auto_close_at && <span className="ml-1">· ⏱ {closesIn(p.auto_close_at)}</span>}
                  </span>
                  <button
                    onClick={() => close(p.id)}
                    disabled={closing === p.id}
                    className="rounded-md border border-border px-2 py-1 font-medium hover:bg-card disabled:opacity-50"
                  >
                    {closing === p.id ? "Closing…" : "Close"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <OpenModal
          accountId={accountId}
          accountType={accountType}
          cash={cash}
          leverage={leverage}
          unit={unit}
          onClose={() => setOpenModal(false)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
function OpenModal({
  accountId,
  accountType,
  cash,
  leverage,
  unit,
  onClose,
}: {
  accountId: string;
  accountType: string;
  cash: number;
  leverage: number;
  unit: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [symbol, setSymbol] = useState<{ symbol: string; name: string } | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [qty, setQty] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [durUnit, setDurUnit] = useState<"off" | "min" | "hour">("off");
  const [durAmount, setDurAmount] = useState("60");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Fetch a live price when a symbol is picked, for the margin estimate.
  useEffect(() => {
    if (!symbol) return;
    let active = true;
    setPrice(null);
    fetch(`/api/quote?symbol=${encodeURIComponent(symbol.symbol)}`)
      .then((r) => r.json())
      .then((j) => active && j.quote?.price && setPrice(j.quote.price))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [symbol]);

  const units = Number(qty) || 0;
  const margin = symbol && price ? marginFor(units, price, leverage, symbol.symbol) : 0;
  const affordable = margin > 0 && margin <= cash;
  // Optional trade duration → auto-close after this many minutes (null = none).
  const autoCloseMinutes =
    durUnit === "off"
      ? null
      : (Number(durAmount) || 0) > 0
        ? Number(durAmount) * (durUnit === "min" ? 1 : 60)
        : null;

  async function submit() {
    setError(null);
    if (!symbol) return setError("Pick a symbol.");
    if (units <= 0) return setError(`Enter a ${unit} amount.`);
    if (!affordable) return setError("Not enough free cash for the required margin.");
    setLoading(true);
    const res = await openFxPositionAction({
      accountId,
      symbol: symbol.symbol,
      direction,
      units,
      stopLoss: sl.trim() ? Number(sl) : null,
      takeProfit: tp.trim() ? Number(tp) : null,
      autoCloseMinutes,
    });
    setLoading(false);
    if (res.error) return setError(res.error);
    setDone(true);
    router.refresh();
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary";

  if (done) {
    return (
      <Modal title="Position opened" onClose={onClose}>
        <div className="space-y-4 text-sm">
          <p>
            Opened <strong>{direction === "LONG" ? "Long" : "Short"}</strong> {units} {unit} of{" "}
            <strong>{symbol?.symbol}</strong>{price ? <> at <strong>{formatCurrency(price)}</strong></> : null}.
          </p>
          <button onClick={onClose} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Open long / short" onClose={onClose}>
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">{error}</div>
        )}

        {!symbol ? (
          <div>
            <label className="mb-1 block text-sm font-medium">Symbol</label>
            <SymbolSearch
              assetType={accountType}
              onSelect={(r) => setSymbol({ symbol: r.symbol, name: r.name })}
              placeholder={accountType === "crypto" ? "Search crypto…" : "Search a stock…"}
            />
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm">
            <span>
              <strong>{symbol.symbol}</strong> <span className="text-muted">{symbol.name}</span>
            </span>
            <span className="font-semibold">{price ? formatCurrency(price) : "…"}</span>
          </div>
        )}

        {symbol && (
          <>
            <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
              {(["LONG", "SHORT"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDirection(d)}
                  className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                    direction === d
                      ? d === "LONG"
                        ? "bg-positive text-white"
                        : "bg-negative text-white"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {d === "LONG" ? "Buy / Long ▲" : "Sell / Short ▼"}
                </button>
              ))}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Quantity ({unit})</label>
              <input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} placeholder="0" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Stop-loss (optional)</label>
                <input type="number" min="0" step="any" value={sl} onChange={(e) => setSl(e.target.value)} className={inputClass}
                  placeholder={direction === "LONG" ? "Below price" : "Above price"} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Take-profit (optional)</label>
                <input type="number" min="0" step="any" value={tp} onChange={(e) => setTp(e.target.value)} className={inputClass}
                  placeholder={direction === "LONG" ? "Above price" : "Below price"} />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Trade duration (optional)</label>
              <div className="flex gap-1">
                {durUnit !== "off" && (
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={durAmount}
                    onChange={(e) => setDurAmount(e.target.value)}
                    className="w-16 rounded-lg border border-border bg-input px-2 py-2 text-sm outline-none focus:border-primary"
                  />
                )}
                <select
                  value={durUnit}
                  onChange={(e) => setDurUnit(e.target.value as typeof durUnit)}
                  className="flex-1 rounded-lg border border-border bg-input px-2 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="off">No auto-close</option>
                  <option value="min">Minutes</option>
                  <option value="hour">Hours</option>
                </select>
              </div>
              <p className="mt-1 text-xs text-muted">Closes the position at market when the timer runs out.</p>
            </div>

            <div className="space-y-1 rounded-lg border border-border bg-background p-3 text-sm">
              <Row label={`Notional`} value={price ? formatCurrency(units * price) : "…"} />
              <Row label={`Margin required (${leverage}:1)`} value={price ? formatCurrency(margin) : "…"} bold />
              <Row label="Free cash" value={formatCurrency(cash)} />
            </div>

            <button
              onClick={submit}
              disabled={loading || !price || units <= 0 || !affordable}
              className={`w-full rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 ${
                direction === "LONG" ? "bg-positive" : "bg-negative"
              }`}
            >
              {loading ? "Opening…" : `Open ${direction === "LONG" ? "long" : "short"}`}
            </button>
            <p className="text-center text-xs text-muted">Auto-closes (stop-out) if the loss reaches your reserved margin.</p>
          </>
        )}
      </div>
    </Modal>
  );
}

// "closes in 12m" / "closes in 1h 5m" countdown for a timed auto-close.
function closesIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "closing…";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `closes in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `closes in ${h}h${m ? ` ${m}m` : ""}`;
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
