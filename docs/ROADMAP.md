# Poshkan — Prioritized Roadmap

Revised August 2026, after the five built-in scanners (SMC, OTE, Trend Breakout, Mean Reversion,
Candle Range) were removed. Their results were inconsistent and their rules were hard to explain
to a beginner, so what ships now is the **Strategy Lab**: the user writes the rules, backtests
them, and only then lets them trade. The AI Scanner stayed.

That changes the shape of this roadmap. The old P0 was "make auto-trade dependable" across six
scanners; a good part of that work was inside the code just deleted. The remaining gap is
narrower and sharper: **the backtest is now the product**, so it has to be trustworthy, and the
execution path underneath it has to be reliable.

---

## P0 — The things that are still broken

1. ~~**Wick-aware triggers.**~~ **Done, August 2026.** A cron only sees prices when it runs, so
   comparing a resting level against spot-at-run-time missed anything the price touched and
   retraced from between runs — the "hit my TP but never closed" bug. Forex position SL/TP was
   already wick-aware; the fix extended the same treatment to every other price trigger in
   `market-check`: forex entry orders, scaled take-profit levels, spot limit orders and price
   alerts. All five now test the resting level against the **candle high/low since the last run**
   (widened to include the live price) and fill **at the level**, matching `bracketHit`.
   *Remaining limit:* the window is 6×5-minute candles (~30 min). If the pinger stalls longer than
   that, levels touched in the gap are still missed — which makes item 2 below the real
   dependency now.
2. **Point the pinger at the surviving cron.** `/api/cron/scanners` now bundles three handlers
   (custom strategies, AI scanner, `market-check`) instead of eight. The five
   `/api/cron/<name>-scan` URLs are deleted and will 404. Confirm the external pinger hits the
   bundle every ~1–2 min, document it, and add a health indicator when a run hasn't landed. With
   item 1 done this is the top reliability item: the wick window only covers ~30 minutes, so a
   stalled pinger is now the single way a bracket gets missed.
3. **Honest backtest numbers.** Promoted from the old P2.9, because a lab whose backtest flatters
   the user is worse than no lab. Walk-forward / out-of-sample windows and basic cost modeling
   (spread, slippage) so a strategy that only worked on the sample says so.

## P1 — Make the lab worth trusting

4. **Deeper market data.** Promoted from the old P2.8 for the same reason: free Yahoo caps
   intraday history at roughly 8 weeks, and that cap is now a direct ceiling on the core feature.
   Evaluate a paid or cached feed.
5. **Strategy comparison.** The old P1.5 ranked the six built-ins against each other and died with
   them. Rebuild it around what the user owns: run *their* strategies over one symbol set and rank
   by net R / win rate / profit factor, so they can tell their own ideas apart.
6. **Execution log in the UI.** A per-account feed of "signal → traded / skipped (reason)". Still
   valid, now scoped to custom strategies and the AI Scanner.
7. **Consistent "skipped" reasons.** Every alert should say *why* no trade opened (alert-only,
   max-open, daily cap or loss limit, sizing, rejected). Was "across all six scanners"; now just
   `custom-scan` and `scan-opportunities`, so it is nearly done.
8. **Position lifecycle correctness.** Consistent `source` tagging, dedupe, and
   one-direction-per-account across the two remaining scan crons.

## P2 — Onboarding into the lab

9. **A first strategy that isn't a blank page.** The demo account no longer arrives with a scanner
   switched on, so the guided flow now has to carry a new user from "funded account" to "a rule I
   wrote and backtested" without stranding them. Starter templates — a breakout, a mean-reversion
   bounce — pre-loaded into the builder and clearly marked as starting points to edit, not
   black boxes to trust.
10. **Turn the `/strategies` pages into recipes.** Those explainers survived the removal as
    educational SEO content, but they now describe strategies the product no longer ships. Give
    each one a "build this in the Lab" recipe — the exact rules to enter — so the traffic converts
    instead of bouncing off a concept with nowhere to go.
11. **Per-account exposure budget.** Cap combined risk when several strategies trade one account.
    Less urgent than it was, since fewer things run per account by default.

## P3 — Engagement & growth

12. **Gamification loop.** Streaks, badges (first profit, beat SPY, win streak), weekly AI recap
    email.
13. **Social.** Public trader profiles, share/clone a **strategy** (the config is now the user's
    own work, which makes sharing more meaningful than it was), and a "top-performing strategies"
    board — the viral loop.
14. **Continued mobile/PWA polish.** Install prompt, offline, native-feeling nav.

## P4 — Cleanup & polish

15. **Drop the frozen scanner tables.** `smc_settings`, `ote_settings`, `trend_settings`,
    `meanrev_settings`, `candlerange_settings` and their signal tables still hold real user rows
    but nothing reads or writes them. They are deliberately the undo button for this removal —
    drop them in their own migration once the decision has settled, and not before.
16. **Empty states & skeletons** (partly done) and one consistent card/type system.

---

## Suggested next step

P0.1 is done, so the next thing is **P0.2** — confirm the external pinger is aimed at
`/api/cron/scanners` and not at one of the five deleted URLs. It is a five-minute check, the
scanner removal just made it urgent, and it is now the *only* remaining way a bracket gets missed
(the wick window is ~30 minutes wide, so a stalled cron is the one gap left). Then **P0.3**.

After that, **P2.9 (starter templates)** is likely higher leverage than more backtest depth: the
lab is now the entire value proposition for a new user, and right now it greets them with an empty
form.
