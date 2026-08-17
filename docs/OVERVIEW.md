# Poshkan — Overview

**Practice trading stocks, crypto & forex with virtual money — then let strategy scanners trade for you.**

Poshkan is a risk-free trading simulator and PWA. Live prices, real order mechanics, 100% virtual money — plus a set of automated, backtestable strategy scanners that watch the market 24/7 and can trade on their own within your risk limits.

---

## Who it's for
- **Beginners** who want to learn to trade without risking real money.
- **Developing traders** who want to test strategies and habits before going live.
- **Strategy-curious users** who want to see systematic edges (trend, mean-reversion, smart-money) run hands-off and compare them.

## What you get

### Trade across three markets
- Independent paper accounts for **stocks, crypto, and forex** — each with its own cash, leverage, and asset class.
- **Spot** buy/sell **and leveraged long/short** positions.
- Market & limit orders, forex entry orders, **stop-loss / take-profit**, scaled take-profits, and timed auto-close.
- Live quotes and charts (native candlestick/area + a full TradingView advanced chart).

### Strategy scanners (the core differentiator)
Six deterministic, **backtestable** scanners — each with a live per-symbol read, a symbol picker, and **Alert-only or Auto-trade** modes:
| Scanner | Edge |
|---|---|
| **SMC** | Smart-Money structure: trend + fair-value gap + liquidity sweep + confirmation |
| **OTE** | ICT pullback into the 62–79% Fibonacci zone after a sweep |
| **Trend Breakout** | Donchian/Turtle breakout that rides sustained trends |
| **Mean Reversion** | Bollinger-band bounce back to the mean (optional RSI-2 filter) |
| **Candle Range** | Range/box edge fades and breaks |
| **AI Scanner** | Claude-powered, steered by your own plain-English strategy (bring-your-own API key) |

Each scanner can **backtest on recent history** (win rate, net R, profit factor, equity curve) so you deploy the edge that actually works on *your* symbols — and can **auto-trade** within per-account risk limits (risk %, max open, daily trade cap, daily-loss limit).

### Everything around it
- **Performance dashboard** — equity curve, realized/unrealized P&L, day-by-day history.
- **Leaderboard** — accounts ranked by % return.
- **AI coach & journal** — journal your reasoning; Claude reviews it against outcomes.
- **Notifications** — Web Push to your phone's lock screen + email alerts.
- **Onboarding** — one-tap funded demo account with a scanner pre-enabled and a guided flow.

## How it's built
Next.js 16 (App Router, server actions) · Supabase (Postgres + RLS) · Yahoo Finance market data · Anthropic SDK (encrypted bring-your-own key) · Web Push/VAPID · background crons for scanning, position monitoring, and daily snapshots · deployed on Vercel.

## Why it's different
Most tools give you *one* of: a simulator, a journal, or a screener. Poshkan combines **multi-asset paper trading + multiple deterministic, one-tap-backtestable, auto-trading strategies + an AI coach** in a single free app — and the scanners are its defensible core.

---
*See [ROADMAP.md](./ROADMAP.md) for what's next.*
