"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FxPosition, Quote } from "@/lib/types";
import { formatCurrency, formatSignedCurrency, changeColor } from "@/lib/format";
import { symbolLabel } from "@/lib/assets";
import { autoCloseReason, marginFor, TRADE_LEVERAGE_OPTIONS } from "@/lib/forex";
import {
  autoCloseFxPositionAction,
  openFxPositionAction,
  closeFxPositionAction,
  setFxSlTpAction,
} from "@/app/dashboard/[accountId]/actions";
import SymbolSearch from "@/components/SymbolSearch";
import Modal from "@/components/Modal";
import SourceBadge from "./SourceBadge";
import PositionCard from "./PositionCard";

// Leveraged long/short positions for stock & crypto accounts — the same engine
// as forex (margin, SL/TP, stop-out), surfaced for these markets so the user can
// short. Coexists with the account's buy-and-hold holdings.
export default function LeveragePanel({
  accountId,
  accountType,
  cash,
  positions,
  quotes,
}: {
  accountId: string;
  accountType: string;
  cash: number;
  positions: FxPosition[];
  quotes: Record<string, Quote>;
}) {
  const router = useRouter();
  const [open, setOpenModal] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [editSltp, setEditSltp] = useState<FxPosition | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const live = positions.filter((p) => p.status === "open");
  const closed = positions
    .filter((p) => p.status !== "open")
    .sort((a, b) => new Date(b.closed_at ?? 0).getTime() - new Date(a.closed_at ?? 0).getTime());
  const unit = accountType === "crypto" ? "coins" : "shares";

  // Live auto-close while the page is open, on every quote poll. The forex
  // panel has had this all along; leveraged positions on stock and crypto
  // accounts never got it, so a stop here waited up to a full cron interval
  // while the user watched price go through it. The server re-verifies with a
  // fresh rate, so a stale quote can't force a close, and the RPC's
  // status='open' guard makes a double-fire harmless.
  const autoRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const p of live) {
      if (autoRef.current.has(p.id)) continue;
      // Timed auto-close: close at market once the timer passes (the server
      // fetches its own rate, so no quote is needed here).
      if (p.auto_close_at && new Date(p.auto_close_at).getTime() <= Date.now()) {
        autoRef.current.add(p.id);
        closeFxPositionAction(p.id, accountId)
          .then((r) => {
            if (!r.error) router.refresh();
            else autoRef.current.delete(p.id);
          })
          .catch(() => autoRef.current.delete(p.id));
        continue;
      }
      const q = quotes[p.symbol.toUpperCase()];
      if (!q?.price) continue;
      if (!autoCloseReason(p, q.price)) continue;
      autoRef.current.add(p.id);
      // Refresh only on a confirmed close — refreshing on a server-declined
      // close (stale client rate) would loop this effect.
      autoCloseFxPositionAction(p.id, accountId)
        .then((r) => {
          if (r.closed) router.refresh();
          else autoRef.current.delete(p.id);
        })
        .catch(() => autoRef.current.delete(p.id));
    }
  }, [live, quotes, accountId, router]);

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
          <p className="text-xs text-muted">Choose leverage per trade (1–10×) · margin from cash · short to profit when price falls</p>
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
            const rate = quotes[p.symbol.toUpperCase()]?.price;
            return (
              <PositionCard
                key={p.id}
                position={p}
                title={symbolLabel(p.symbol)}
                rate={rate}
                unitLabel={unit}
                fmtPrice={formatCurrency}
                metric="percent"
                surfaceClass="bg-background"
                expanded={expandedId === p.id}
                onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                onEditSltp={() => setEditSltp(p)}
                onClose={() => close(p.id)}
                closing={closing === p.id}
                autoCloseLabel={p.auto_close_at ? closesIn(p.auto_close_at) : null}
              />
            );
          })}
        </div>
      )}

      {closed.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-medium text-muted">Closed positions</div>
          <div className="space-y-1">
            {closed.slice(0, 12).map((p) => {
              const isExpanded = expandedId === p.id;
              return (
                <div key={p.id} className="rounded-lg border border-border bg-background">
                  {/* Collapsed header — tap to expand */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs"
                  >
                    <span>
                      <span className={p.direction === "LONG" ? "font-medium text-positive" : "font-medium text-negative"}>
                        {p.direction === "LONG" ? "Long" : "Short"}
                      </span>{" "}
                      {symbolLabel(p.symbol)}
                      <SourceBadge source={p.source} />
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`font-medium ${changeColor(Number(p.pnl ?? 0))}`}>
                        {formatSignedCurrency(Number(p.pnl ?? 0))}
                      </span>
                      <span className={`text-base leading-none text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                        ›
                      </span>
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="space-y-0.5 border-t border-border px-3 py-2 text-xs text-muted">
                      <div>
                        {Number(p.units).toLocaleString("en-US")} {unit} · {formatCurrency(Number(p.open_rate))} →{" "}
                        {p.close_rate != null ? formatCurrency(Number(p.close_rate)) : "—"} · {outcomeLabel(p.status)}
                      </div>
                      <div>
                        {levOf(p)}× lev · opened {fmtClosed(p.opened_at)}
                        {p.closed_at ? ` · closed ${fmtClosed(p.closed_at)}` : ""}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {open && (
        <OpenModal
          accountId={accountId}
          accountType={accountType}
          cash={cash}
          unit={unit}
          onClose={() => setOpenModal(false)}
        />
      )}

      {editSltp && (
        <SlTpModal
          accountId={accountId}
          position={editSltp}
          rate={quotes[editSltp.symbol.toUpperCase()]?.price}
          unit={unit}
          onClose={() => setEditSltp(null)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Exported so the symbol panel can open this ticket directly for the symbol
// already on screen, without the leveraged panel existing on the page at all.
export function OpenModal({
  accountId,
  accountType,
  cash,
  unit,
  initialSymbol = null,
  onClose,
}: {
  accountId: string;
  accountType: string;
  cash: number;
  unit: string;
  /** Skip the search step when the caller already knows the symbol. */
  initialSymbol?: { symbol: string; name: string } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [symbol, setSymbol] = useState<{ symbol: string; name: string } | null>(initialSymbol);
  const [price, setPrice] = useState<number | null>(null);
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [lev, setLev] = useState<number>(1);
  const [qty, setQty] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [durUnit, setDurUnit] = useState<"off" | "min" | "hour">("off");
  const [durAmount, setDurAmount] = useState("60");
  // The ticket walks four screens: which way, how big, the plan, then the
  // check. A leveraged short is the most dangerous thing in this app, and a
  // beginner meeting it as one dense form learns nothing about what any field
  // means. Each screen explains its own fields in plain words.
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState("");
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
  const margin = symbol && price ? marginFor(units, price, lev, symbol.symbol) : 0;
  const affordable = margin > 0 && margin <= cash;

  // Risk-based sizing: with a stop set, the dollar loss at the stop is knowable
  // BEFORE entering — surfacing it (and a 1%-risk size) teaches the habit that
  // matters most: size from risk, not from gut feel.
  const slNum = sl.trim() ? Number(sl) : null;
  const slValid =
    slNum != null && slNum > 0 && price != null && (direction === "LONG" ? slNum < price : slNum > price);
  const riskPerUnit = slValid && price ? Math.abs(price - slNum) : 0;
  const riskAtStop = riskPerUnit * units;
  const riskPct = cash > 0 ? (riskAtStop / cash) * 100 : 0;
  const onePctUnits =
    riskPerUnit > 0
      ? accountType === "crypto"
        ? Math.floor(((cash * 0.01) / riskPerUnit) * 1e4) / 1e4
        : Math.floor((cash * 0.01) / riskPerUnit)
      : 0;
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
      leverage: lev,
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

  // ---- the plan, priced ----
  const tpNum = tp.trim() ? Number(tp) : null;
  const tpValid =
    tpNum != null && tpNum > 0 && price != null && (direction === "LONG" ? tpNum > price : tpNum < price);
  const rewardPerUnit = tpValid && price ? Math.abs(tpNum - price) : 0;
  const rr = riskPerUnit > 0 && rewardPerUnit > 0 ? rewardPerUnit / riskPerUnit : 0;
  const positionValue = price ? units * price : 0;
  const onePctMove = positionValue * 0.01;

  // Four deterministic checks - no AI, no opinion, just arithmetic on what was
  // typed. Failing one never blocks the trade: a professional is asked these
  // questions, not policed by them.
  const checks = [
    {
      ok: slValid,
      label: "Stop set before entry",
      why: "Decide where you are wrong while you are still calm.",
    },
    {
      ok: riskPct > 0 && riskPct <= 1,
      label: "Risk under 1% of your cash",
      why: "Small enough that being wrong twenty times in a row does not end you.",
    },
    {
      ok: rr >= 1.5,
      label: "Reward at least 1.5× the risk",
      why: "So you can be right less than half the time and still come out ahead.",
    },
    {
      ok: reason.trim().length >= 3,
      label: "Reason written down",
      why: "A trade you cannot explain in one line is a guess.",
    },
  ];
  const passed = checks.filter((c) => c.ok).length;

  const canSize = units > 0 && affordable;
  const stepTitles = ["Which way", "How big", "The plan", "Check"];

  if (done) {
    return (
      <Modal title="Position opened" onClose={onClose}>
        <div className="space-y-4 text-sm">
          <p>
            Opened <strong>{direction === "LONG" ? "Long" : "Short"}</strong> {units} {unit} of{" "}
            <strong>{symbol?.symbol}</strong>{price ? <> at <strong>{formatCurrency(price)}</strong></> : null}.
          </p>
          {slValid && (
            <p className="text-muted">
              Your stop sits at {formatCurrency(slNum as number)}. If it is reached the position closes
              itself — you do not have to be watching.
            </p>
          )}
          <button onClick={onClose} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Done
          </button>
        </div>
      </Modal>
    );
  }

  // No symbol yet (opened from the panel rather than from a symbol): pick one
  // before the walkthrough starts.
  if (!symbol) {
    return (
      <Modal title="Open long / short" onClose={onClose}>
        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Which {accountType === "crypto" ? "coin" : "stock"}?
          </label>
          <SymbolSearch
            assetType={accountType}
            placeholder={accountType === "crypto" ? "Search crypto…" : "Search a stock…"}
            onSelect={(r) => setSymbol({ symbol: r.symbol, name: r.name })}
          />
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`${symbol.symbol} · ${stepTitles[step - 1]}`} onClose={onClose}>
      <div className="space-y-4">
        {/* Where we are in the four screens */}
        <div className="flex gap-1">
          {stepTitles.map((t, i) => (
            <div
              key={t}
              className={`h-1 flex-1 rounded-full ${i + 1 <= step ? "bg-primary" : "bg-border"}`}
              title={`${i + 1}. ${t}`}
            />
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">{error}</div>
        )}

        <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm">
          <strong>{symbol.symbol}</strong>
          <span className="font-semibold">{price ? formatCurrency(price) : "…"}</span>
        </div>

        {/* ---------- 1 - Which way ---------- */}
        {step === 1 && (
          <>
            <p className="text-sm text-muted">
              A leveraged position bets on direction. Pick the one you actually believe.
            </p>
            {([
              {
                key: "LONG" as const,
                title: "Long — betting it rises",
                body: "You make money if the price goes up, and lose if it falls. This is the ordinary way round.",
              },
              {
                key: "SHORT" as const,
                title: "Short — betting it falls",
                body: "You make money if the price goes down. The position is sold first and bought back later, so a rise costs you — and a price can rise without limit.",
              },
            ]).map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setDirection(o.key)}
                className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                  direction === o.key
                    ? o.key === "LONG"
                      ? "border-positive bg-positive/10"
                      : "border-negative bg-negative/10"
                    : "border-border hover:bg-background"
                }`}
              >
                <div className="text-sm font-semibold">{o.title}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-muted">{o.body}</div>
              </button>
            ))}
          </>
        )}

        {/* ---------- 2 - How big ---------- */}
        {step === 2 && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium">How many {unit}?</label>
              <input type="number" min="0" step="any" autoFocus value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} placeholder="0" />
              <p className="mt-1 text-xs text-muted">
                {positionValue > 0
                  ? `A position worth ${formatCurrency(positionValue)}. A 1% move either way is ${formatCurrency(onePctMove)}.`
                  : "The size of the position, before leverage."}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Leverage</label>
              <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
                {TRADE_LEVERAGE_OPTIONS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLev(l)}
                    className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
                      lev === l ? "bg-primary text-primary-foreground shadow-sm" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {l}×
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {lev === 1 ? (
                  <>
                    At <strong>1×</strong> nothing is borrowed: the whole {formatCurrency(positionValue)} comes
                    from your own cash, and a move costs exactly what it looks like. Anything higher borrows
                    the difference.
                  </>
                ) : (
                  <>
                    Leverage is borrowed money. At <strong>{lev}×</strong> you control{" "}
                    {formatCurrency(positionValue)} while only {formatCurrency(margin)} of your cash is set
                    aside — so every move hits that cash <strong>{lev} times harder</strong>. It multiplies
                    losses exactly as much as gains.
                  </>
                )}
              </p>
            </div>

            <div className="space-y-1 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <Row label="Position value" value={formatCurrency(positionValue)} />
              <Row label="Cash set aside (margin)" value={formatCurrency(margin)} />
              <Row label="Cash you have" value={formatCurrency(cash)} />
            </div>
            {units > 0 && !affordable && (
              <p className="text-xs text-negative">
                That needs more margin than you have. Lower the size, or raise the leverage to set aside less.
              </p>
            )}
          </>
        )}

        {/* ---------- 3 - The plan ---------- */}
        {step === 3 && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium">Why this trade?</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
                className={inputClass}
                placeholder="One line — e.g. earnings beat, holding above the 20-day"
              />
              <p className="mt-1 text-xs text-muted">
                Written before, this is a reason. Written after, it is an excuse. One line is enough.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Stop — the price where you are wrong</label>
              <input type="number" min="0" step="any" value={sl} onChange={(e) => setSl(e.target.value)} className={inputClass}
                placeholder={direction === "LONG" ? "Below the price" : "Above the price"} />
              <p className="mt-1 text-xs leading-relaxed text-muted">
                The position closes itself here, whether or not you are watching. It is the only field that
                decides how much you can lose.
                {riskAtStop > 0 && (
                  <>
                    {" "}
                    At this stop you lose <strong className="text-foreground">{formatCurrency(riskAtStop)}</strong>
                    {" "}— {riskPct.toFixed(2)}% of your cash.
                  </>
                )}
                {slNum != null && !slValid && (
                  <span className="text-negative">
                    {" "}
                    A {direction === "LONG" ? "long" : "short"} stop must sit{" "}
                    {direction === "LONG" ? "below" : "above"} the current price.
                  </span>
                )}
              </p>
              {onePctUnits > 0 && (
                <button
                  type="button"
                  onClick={() => setQty(String(onePctUnits))}
                  className="mt-1 text-xs text-primary hover:underline"
                >
                  Size it to risk 1%: {onePctUnits} {unit}
                </button>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Target — the price where you are right</label>
              <input type="number" min="0" step="any" value={tp} onChange={(e) => setTp(e.target.value)} className={inputClass}
                placeholder={direction === "LONG" ? "Above the price" : "Below the price"} />
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Where the position takes its win automatically.
                {rr > 0 && (
                  <>
                    {" "}
                    You stand to make <strong className="text-foreground">{rr.toFixed(1)}×</strong> what you are
                    risking, so this can be wrong {Math.round((1 / (1 + rr)) * 100)}% of the time and still break
                    even.
                  </>
                )}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Close it automatically after (optional)</label>
              <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
                {([
                  { k: "off" as const, l: "No timer" },
                  { k: "min" as const, l: "Minutes" },
                  { k: "hour" as const, l: "Hours" },
                ]).map((o) => (
                  <button key={o.k} type="button" onClick={() => setDurUnit(o.k)}
                    className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                      durUnit === o.k ? "bg-primary text-primary-foreground shadow-sm" : "text-muted hover:text-foreground"
                    }`}>
                    {o.l}
                  </button>
                ))}
              </div>
              {durUnit !== "off" && (
                <input type="number" min="1" value={durAmount} onChange={(e) => setDurAmount(e.target.value)} className={`${inputClass} mt-2`} />
              )}
            </div>
          </>
        )}

        {/* ---------- 4 - Check ---------- */}
        {step === 4 && (
          <>
            <div className="space-y-1 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <Row label="Direction" value={direction === "LONG" ? "Long — betting it rises" : "Short — betting it falls"} />
              <Row label="Size" value={`${units} ${unit} · ${formatCurrency(positionValue)}`} />
              <Row label="Leverage" value={`${lev}×`} />
              <Row label="Cash set aside" value={formatCurrency(margin)} />
              <Row label="Stop" value={slValid ? formatCurrency(slNum as number) : "none"} />
              <Row label="Target" value={tpValid ? formatCurrency(tpNum as number) : "none"} />
              <Row
                label="You lose if stopped"
                value={riskAtStop > 0 ? `${formatCurrency(riskAtStop)} · ${riskPct.toFixed(2)}% of cash` : "no stop set"}
                bold
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-sm font-medium">
                <span>Plan on record</span>
                <span className={passed === 4 ? "text-positive" : "text-muted"}>{passed} of 4</span>
              </div>
              <div className="space-y-1">
                {checks.map((c) => (
                  <div key={c.label} className={`rounded-lg border px-3 py-2 text-xs ${c.ok ? "border-positive/30 bg-positive/10" : "border-amber-500/30 bg-amber-500/10"}`}>
                    <div className="flex items-center gap-2">
                      <span className={c.ok ? "text-positive" : "text-amber-600 dark:text-amber-400"}>{c.ok ? "✓" : "!"}</span>
                      <span className="font-medium">{c.label}</span>
                    </div>
                    <div className="mt-0.5 pl-5 leading-relaxed text-muted">{c.why}</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">
                Nothing here blocks the trade. These are the questions a professional answers before
                entering — you are being asked, not stopped.
              </p>
            </div>
          </>
        )}

        {/* ---------- navigation ---------- */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => (step === 1 ? onClose() : setStep(step - 1))}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-background"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 4 ? (
            <button
              type="button"
              disabled={step === 2 && !canSize}
              onClick={() => setStep(step + 1)}
              className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {step === 2 && !canSize ? "Enter a size you can afford" : "Next"}
            </button>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={submit}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 ${
                direction === "LONG" ? "bg-positive" : "bg-negative"
              }`}
            >
              {loading ? "Opening…" : `Open ${direction === "LONG" ? "long" : "short"} position`}
            </button>
          )}
        </div>
        <p className="text-center text-xs text-muted">
          Auto-closes (stop-out) if the loss reaches the cash you set aside.
        </p>
      </div>
    </Modal>
  );
}


// ---------------------------------------------------------------------------
// Edit a leveraged position's stop-loss / take-profit (parity with forex).
function SlTpModal({
  accountId,
  position,
  rate,
  unit,
  onClose,
}: {
  accountId: string;
  position: FxPosition;
  rate?: number;
  unit: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [sl, setSl] = useState(position.stop_loss != null ? String(position.stop_loss) : "");
  const [tp, setTp] = useState(position.take_profit != null ? String(position.take_profit) : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLong = position.direction === "LONG";

  async function save() {
    setError(null);
    setLoading(true);
    const res = await setFxSlTpAction({
      positionId: position.id,
      accountId,
      stopLoss: sl.trim() ? Number(sl) : null,
      takeProfit: tp.trim() ? Number(tp) : null,
    });
    setLoading(false);
    if (res.error) return setError(res.error);
    onClose();
    router.refresh();
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <Modal title={`SL / TP — ${symbolLabel(position.symbol)}`} onClose={onClose}>
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">{error}</div>
        )}
        <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm">
          <span>
            <strong>{isLong ? "Long" : "Short"}</strong> {Number(position.units).toLocaleString("en-US")} {unit} ·
            opened {formatCurrency(Number(position.open_rate))}
          </span>
          <span className="text-muted">now {rate ? formatCurrency(rate) : "…"}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Stop-loss</label>
            <input
              type="number"
              step="any"
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              className={inputClass}
              placeholder={isLong ? "Below price" : "Above price"}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Take-profit</label>
            <input
              type="number"
              step="any"
              value={tp}
              onChange={(e) => setTp(e.target.value)}
              className={inputClass}
              placeholder={isLong ? "Above price" : "Below price"}
            />
          </div>
        </div>
        <button
          onClick={save}
          disabled={loading}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save SL / TP"}
        </button>
        <p className="text-center text-xs text-muted">Leave a field blank to remove that level.</p>
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

// Effective leverage of a position = notional ÷ margin.
function levOf(p: FxPosition): number {
  const m = Number(p.margin);
  return m > 0 ? Math.max(1, Math.round((Number(p.units) * Number(p.open_rate)) / m)) : 0;
}

// Human label for a closed position's exit reason.
function outcomeLabel(status: string): string {
  return status === "sl"
    ? "Stop-loss"
    : status === "tp"
      ? "Take-profit"
      : status === "stopped"
        ? "Stop-out"
        : "Manual close";
}

function fmtClosed(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
