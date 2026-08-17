# Poshkan — Prioritized Roadmap

The product is feature-rich and past MVP. The maturity gap now is **reliability and trust in auto-execution**, not features. Priorities are ordered accordingly: harden the trade lifecycle first, then transparency, then data depth, then growth.

---

## P0 — Make auto-trade dependable (do these first)
The recent issues ("auto is on but nothing trades", "hit TP but didn't close") all live here.

1. **Wick-aware TP/SL closes.** The closer currently checks the *spot price at cron-run time*, so a price that touches TP/SL between runs and retraces is missed. Close on each symbol's **candle high/low since the last run** (real bracket-order behavior). *Highest-value reliability fix.*
2. **One reliable, frequent cron.** `market-check` (closes positions, fills orders, fires alerts) is now bundled into `/api/cron/scanners`. Confirm the external pinger hits that URL every ~1–2 min; document it; add a health indicator if a run hasn't landed recently.
3. **Consistent "auto-trade skipped" reasons.** Every scanner's alert should state *why* a trade wasn't opened (alert-only, max-open, correlation cap, daily cap/loss, sizing, rejected). Mostly done — finish/normalize across all scanners.
4. **Position lifecycle correctness.** Consistent `source` tagging, dedupe, and one-direction-per-account handling across all scanner crons.

## P1 — Trust & transparency
5. **Scanner-comparison view.** Run every scanner's backtest on a chosen symbol set and rank by net R / win rate / profit factor — so users deploy the edge that works, not a guess.
6. **Execution log in the UI.** A per-account feed of "signal → traded / skipped (reason)" so behavior is auditable at a glance.
7. **Per-account exposure budget.** When multiple scanners auto-trade one account, cap combined risk so correlated positions don't stack.

## P2 — Data & backtest depth
8. **Deeper market data.** Free Yahoo caps intraday history (~8 weeks), which limits sample size. Evaluate a paid/cached feed for longer, more meaningful backtests.
9. **Stronger backtests.** Walk-forward / out-of-sample windows and basic cost modeling (spread/slippage) so results are less optimistic.

## P3 — Engagement & growth
10. **Gamification loop.** Streaks, badges (first profit, beat SPY, win streak), and a weekly AI recap email.
11. **Social.** Public trader profiles, share/clone a scanner config, and a "top-performing configs" board — the viral loop.
12. **Continued mobile/PWA polish.** Install prompt, offline, native-feeling nav.

## P4 — Polish
13. **Empty states & skeletons** (partly done) and one consistent card/type system across the now-many cards.

---

## Suggested next step
Ship **P0.1 (wick-aware closes)** — it directly ends the "didn't close at TP" class of bugs and is the single biggest trust win. Then a short **execution-hardening pass (P0.2–P0.4)** before adding any new strategy. After that, **P1.5 (scanner comparison)** is the highest-leverage feature for helping users actually profit.
