"use client";

import { useState } from "react";
import SymbolSearch from "@/components/SymbolSearch";
import { marketUniverse, symbolLabel, assetTypeError } from "@/lib/assets";
import { FX_PAIRS } from "@/lib/forex";
import { compareScanners, type ScannerCompareRow } from "@/app/dashboard/scanners/actions";

export default function ScannerCompare({
  accounts,
}: {
  accounts: { id: string; name: string; type: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const type = account?.type ?? "stocks";
  const [symbols, setSymbols] = useState<string[]>(marketUniverse(type).slice(0, 3));
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ScannerCompareRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function pickAccount(id: string) {
    setAccountId(id);
    const t = accounts.find((a) => a.id === id)?.type ?? "stocks";
    setSymbols(marketUniverse(t).slice(0, 3));
    setRows(null);
    setErr(null);
  }

  const add = (s: string) =>
    setSymbols((p) => (p.includes(s) || assetTypeError(type, s) ? p : [...p, s]).slice(0, 5));
  const toggle = (s: string) =>
    setSymbols((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]).slice(0, 5));
  const remove = (s: string) => setSymbols((p) => p.filter((x) => x !== s));

  async function run() {
    setLoading(true);
    setErr(null);
    setRows(null);
    try {
      const res = await compareScanners({ accountId, symbols });
      if (res.error) setErr(res.error);
      else setRows(res.rows ?? []);
    } catch (e) {
      setErr(`Comparison failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  if (accounts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between">
        <span className="text-sm font-semibold">⚖️ Compare scanners</span>
        <span className="text-xs text-muted">{open ? "Hide" : "Which one has an edge?"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted">
            Backtests all five deterministic scanners on the same symbols and ranks them by net R — so
            you can see which edge fits your list before turning one on. (Up to 5 symbols; can take a few
            seconds.)
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Account</span>
            <select
              value={accountId}
              onChange={(e) => pickAccount(e.target.value)}
              className="rounded-lg border border-border bg-input px-2 py-1.5 text-sm outline-none focus:border-primary"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>

          {/* Symbol picker (asset-class constrained) */}
          <div>
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {symbols.length === 0 ? (
                <span className="text-xs text-muted">Add up to 5 symbols.</span>
              ) : (
                symbols.map((s) => (
                  <span
                    key={s}
                    className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary"
                  >
                    {symbolLabel(s)}
                    <button onClick={() => remove(s)} aria-label={`Remove ${s}`} className="text-primary/70 hover:text-negative">
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
            {type === "forex" ? (
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-background p-2">
                {FX_PAIRS.map((p) => (
                  <button
                    key={p.symbol}
                    onClick={() => toggle(p.symbol)}
                    className={`rounded-lg border px-2 py-1 text-xs ${
                      symbols.includes(p.symbol) ? "border-primary bg-primary/10 text-primary" : "border-border"
                    }`}
                  >
                    {symbolLabel(p.symbol)}
                  </button>
                ))}
              </div>
            ) : (
              <SymbolSearch
                assetType={type}
                placeholder={type === "crypto" ? "Add a crypto…" : "Add a stock…"}
                onSelect={(r) => add(r.symbol)}
              />
            )}
          </div>

          <button
            onClick={run}
            disabled={loading || symbols.length === 0}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Running 5 backtests…" : "Run comparison"}
          </button>

          {err && <p className="text-xs text-negative">{err}</p>}

          {rows && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="px-2 py-2 text-left">Scanner</th>
                    <th className="px-2 py-2 text-right">Net R</th>
                    <th className="px-2 py-2 text-right">Win %</th>
                    <th className="px-2 py-2 text-right">PF</th>
                    <th className="px-2 py-2 text-right">Max DD</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.key}
                      className={`border-b border-border last:border-0 ${
                        i === 0 && r.n > 0 && r.totalR > 0 ? "bg-emerald-500/5" : ""
                      }`}
                    >
                      <td className="px-2 py-2">
                        <span className="mr-1 text-muted">{i + 1}.</span> {r.icon} {r.name}
                        <span className="ml-1 text-xs text-muted">· {r.n} trades</span>
                      </td>
                      <td className={`px-2 py-2 text-right font-semibold ${r.totalR >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {r.n === 0 ? "—" : `${r.totalR >= 0 ? "+" : ""}${r.totalR}R`}
                      </td>
                      <td className="px-2 py-2 text-right text-muted">{r.n === 0 ? "—" : `${Math.round(r.winRate * 100)}%`}</td>
                      <td className="px-2 py-2 text-right text-muted">
                        {r.n === 0 ? "—" : r.profitFactor === -1 ? "∞" : r.profitFactor.toFixed(2)}
                      </td>
                      <td className="px-2 py-2 text-right text-muted">{r.n === 0 ? "—" : `−${r.maxDrawdownR}R`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-muted">
                Ranked by net R on the default settings of each scanner. Judge trend/breakout by net R,
                mean-reversion by win rate + PF. A tiny trade count means too small a sample to trust.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
