# SMC PRO MTF — v2 (fully specified)

Target market: **crypto** (24/7). Trend TF **H1**, entry TF **M5**.
This is the gap-corrected version of the original v1. Every previously-vague rule now has a
concrete, codeable definition and a default value. Defaults are chosen to be conservative and
testable; each is a single knob we can tune later from real paper-trading results.

This doc is the **specification** only — the scanner that runs it is a separate, later step.

---

## 0. Data hygiene (new — non-negotiable)
Bad data silently breaks every SMC rule, so this comes first.
- Use **only fully-closed, grid-aligned candles.** Yahoo appends a live "snapshot" bar
  (O=H=L=C, datetime *not* on the grid). **Drop it.**
- A bar is real iff: M5 → `seconds == 0 && minute % 5 == 0`; H1 → `seconds == 0 && minute == 0`.
- All signals evaluate on the **last closed** bar — never the forming one. (This is the exact bug
  we hit when reading confirmations live.)

## 1. Swing definition (the linchpin — everything depends on it)
- **Fractal swing**, lookback **N = 2** bars each side:
  - Swing High at bar *i* iff `high[i] > high[i±1..i±2]`.
  - Swing Low at bar *i* iff `low[i] < low[i±1..i±2]`.
- A swing is **confirmed only after N bars close to its right** → no repaint.
- Computed independently on H1 (for trend) and M5 (for sweeps & stops).

## 2. Trend via BOS (Break of Structure)
- Track the ordered list of **confirmed H1 swing highs (SH) and swing lows (SL)**.
- **Bull BOS** = an H1 candle **closes above** the most recent confirmed SH.
- **Bear BOS** = an H1 candle **closes below** the most recent confirmed SL.
- `trend` = direction of the **most recent BOS**. It **flips only** on an opposite-direction BOS.
- `neutral` when: no BOS exists yet in the window, **or** the last bull-BOS and last bear-BOS are
  within **3 H1 bars** of each other (whipsaw / chop → stand aside).
- Break is judged on **close**, not wick (stricter, fewer fakeouts).

## 3. Sessions (mismatch resolved)
- Crypto is 24/7 and global → **session filter is OFF for crypto.** Step 2 of v1 does not apply.
- (Kept as an optional toggle only if this is ever pointed at forex: London 07:00–16:00 UTC +
  NY 12:00–21:00 UTC. DST is moot in UTC.)
- Optional low-liquidity avoidance for crypto: skip **00:00–06:00 UTC** — **default OFF**.

## 4. FVG detection (3-candle)
- **Bullish FVG**: `high[i-2] < low[i]` → zone = `[high[i-2], low[i]]`.
- **Bearish FVG**: `low[i-2] > high[i]` → zone = `[high[i], low[i-2]]`.
- **Validity threshold**: zone size ≥ **0.5 × ATR(14)** on M5 (filters weak gaps).
- **Direction filter**: only FVGs **aligned with the H1 trend** are tracked (bull trend → bullish
  FVGs only, and vice-versa). All counter-trend FVGs discarded.

## 5. FVG lifecycle (invalidation resolved)
- **Active** on formation.
- **First retest** = first later candle whose range touches the zone. Only the **first** valid
  retest can ever produce a signal; after a signal (or a full mitigation) the FVG is **used/dead**.
- **Mitigated / dead** when a candle **closes fully beyond the far edge** (bull FVG dies on a close
  *below its bottom*; bear FVG dies on a close *above its top*). A wick through is allowed; a
  **close** through kills it.
- **Expiry**: if not retested within **50 M5 bars** (~4 h), discard as stale.

## 6. Liquidity sweep (subjective step pinned down)
- **Pool** = the **most recent confirmed M5 swing** that formed **before** the retest:
  - Long setup → most recent prior **swing low**.
  - Short setup → most recent prior **swing high**.
- **Sweep** = price **wicks beyond** that level and returns, occurring **between FVG formation and
  the confirmation candle**:
  - Long: some candle's `low < swingLow.price`.
  - Short: some candle's `high > swingHigh.price`.
- **Enhancement (default OFF):** prefer an **equal-lows/highs cluster** (≥2 swings within
  0.1 × ATR) as stronger liquidity when one exists.

## 7. Confirmation candle
After **retest AND sweep** are both satisfied, wait for a **closed M5 candle** that:
1. **closes inside the FVG zone**, AND
2. is **in the trend direction** (long: `close > open`; short: `close < open`), AND
3. *(quality bonus, not required)* closes in the **top/bottom 40%** of its own range in the trade
   direction.
- Signal fires **on that candle's close**. **Non-repainting.**

## 8. Entry
- **Market entry at the confirmation candle's close.** Price is always fetched server-side by the
  app (never trust a client/snapshot price).

## 9. Stop loss (selectable; default chosen)
- Buffer `B = 0.1 × ATR(14)` (M5).
- **Default = "behind the swept swing"**: long → `swingLow − B`; short → `swingHigh + B`.
  *(Reason: the sweep wick often pokes past the FVG edge, so an FVG-edge stop gets hunted out
  instantly. The swing stop sits beyond the wick → fewer premature stop-outs.)*
- **Alternative = "behind the FVG"** (tighter, higher RR, more stop-outs): long → `FVGbottom − B`;
  short → `FVGtop + B`.

## 10. Take profit
- **Default = fixed 1:2 RR.** `R = |entry − SL|`; TP = `entry ± 2R`.
- Selectable **1:3 / 1:4**.
- **Enhancement (default OFF) — liquidity target:** aim at the next opposing liquidity (prior swing
  high for longs / low for shorts) **if** it yields ≥ 1:2; otherwise fall back to fixed 2R.

## 11. Trade management (new — filled gap)
- **Break-even**: move SL to entry once price reaches **+1R**. **Default ON.**
- **Partial**: optionally take **50% at +1R**, let the rest run to TP (uses the app's multi-step TP).
  **Default OFF**, available.

## 12. Position sizing (new — the biggest missing piece)
- **Risk per trade = 2% of account equity** (configurable 0.5–3%).
- `units = (equity × risk%) / (SL distance in price)`, converted to the app's units (shares/coins).
- Cap by free cash / leverage: if required margin > free cash, **scale down**; if still infeasible,
  **skip the trade** (never exceed available margin).

## 13. Portfolio & risk rules (new)
- **Max concurrent positions = 2.**
- **Correlation cap**: BTC/ETH/SOL/major alts move together → **max 1 open position per direction**
  across correlated majors (three correlated shorts = one triple-sized bet — disallowed).
- **Max trades/day = 5** (circuit breaker).
- **Daily loss limit**: stop opening new trades for the rest of the UTC day after **−4% equity**.
- No new entry that **opposes** an existing position on a correlated symbol.

## 14. Universe
- **Liquid crypto majors only**: BTC-USD, ETH-USD, SOL-USD (optionally BNB-USD, XRP-USD, ADA-USD,
  AVAX-USD). Avoid microcaps — noisy, gappy structure breaks FVG/swing logic.

---

## Decision flow (unambiguous algorithm)
Per symbol, on each closed M5 bar:
1. Refresh H1 `trend` (§2). If `neutral` → **stop**.
2. Refresh/maintain active trend-aligned FVGs (§4–5). Expire/mitigate as needed.
3. For the most recent active FVG that price has **retested** (§5):
   a. Check **liquidity sweep** (§6). If not swept → **wait**.
   b. Check **confirmation candle** on the last closed bar (§7). If absent → **wait**.
4. If retest ✅ + sweep ✅ + confirmation ✅:
   - Compute SL (§9), TP (§10), size (§12).
   - Apply portfolio gates (§13). If any gate blocks → **skip**.
   - **Enter** (§8); arm break-even/partials (§11). Mark the FVG **used**.
5. Else → **no trade** (this is the common, correct outcome).

---

## Parameter table (the scanner's config — all in one place)
| Param | Default | Range/Notes |
|---|---|---|
| Trend TF / Entry TF | H1 / M5 | fixed |
| Swing fractal N | 2 | 2–3 |
| BOS basis | close | close \| wick |
| Neutral-whipsaw window | 3 H1 bars | |
| Session filter (crypto) | OFF | |
| ATR period | 14 | |
| FVG min size | 0.5 × ATR | 0.3–1.0 |
| FVG expiry | 50 M5 bars | |
| Sweep pool | most recent prior swing | +equal-lows (off) |
| Confirmation | close inside FVG + trend dir | +40% range (bonus) |
| SL mode | behind swing | swing \| FVG |
| SL buffer | 0.1 × ATR | |
| TP | 1:2 | 1:2 / 1:3 / 1:4 / liquidity |
| Break-even at +1R | ON | |
| Partial 50% at +1R | OFF | |
| Risk per trade | 2% equity | 0.5–3% |
| Max concurrent | 2 | |
| Correlation cap | 1 per direction (majors) | |
| Max trades/day | 5 | |
| Daily loss limit | −4% equity | |
| Universe | BTC/ETH/SOL (+majors) | liquid only |

---

## Honest note on edge
These corrections make the strategy **complete, unambiguous, and testable** — they do **not**
guarantee profit. The edge (if any) comes from trend-alignment, confirmation discipline, ≥1:2 RR,
and strict risk caps. The right next move is to run it on the paper account and **measure** the win
rate, average R, and max drawdown — not to assume it works. That measurement is what the scanner
phase is for.
