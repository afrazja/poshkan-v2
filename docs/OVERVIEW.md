# Poshkan — Overview

**Practice trading stocks, crypto & forex with virtual money — then build and test your own strategies on it.**

Poshkan is a risk-free trading simulator and PWA. Live prices, real order mechanics, 100% virtual money — plus a strategy lab where you write your own rules, backtest them on real history, and let them trade on their own within your risk limits.

---

## Who it's for
- **Beginners** who want to learn to trade without risking real money.
- **Developing traders** who want to test strategies and habits before going live.
- **Strategy-curious users** who want to encode an edge as explicit rules, backtest it, and see whether it actually holds up.

## What you get

### Trade across three markets
- Independent paper accounts for **stocks, crypto, and forex** — each with its own cash, leverage, and asset class.
- **Spot** buy/sell **and leveraged long/short** positions.
- Market & limit orders, forex entry orders, **stop-loss / take-profit**, scaled take-profits, and timed auto-close.
- Live quotes and charts (native candlestick/area + a full TradingView advanced chart).

### Strategy Lab (the core differentiator)
The six built-in scanners were removed in August 2026: their results were inconsistent, and a
black-box rule a beginner cannot explain teaches nothing. What replaced them is a lab where the
user writes the rules themselves:

| Tool | What it does |
|---|---|
| **Strategy builder** | Pick symbols, a timeframe, and exact entry conditions; set the stop, target, and max hold. The rule is yours, in words you chose. |
| **Backtest** | Replay completed candles with estimated costs — win rate, net R, profit factor, equity curve — before anything trades. |
| **Paper alerts / auto-trade** | Run a strategy live in alert-only or auto-trade mode, inside per-account risk limits (risk %, max open, daily trade cap, daily-loss limit). |
| **AI Scanner** | Claude-powered, steered by your own plain-English strategy (bring-your-own API key) — for edges that are judgement rather than formula. |

The point is that a strategy you assembled is one you can explain. `/strategies` keeps the
plain-English explainers for SMC, OTE, trend breakout, mean reversion and range trading as
educational reading — the concepts are still worth learning, they're just no longer shipped as
switches to flip.

### Everything around it
- **Performance dashboard** — equity curve, realized/unrealized P&L, day-by-day history.
- **Leaderboard** — accounts ranked by % return.
- **AI coach & journal** — journal your reasoning; Claude reviews it against outcomes.
- **Notifications** — Web Push to your phone's lock screen + email alerts.
- **Onboarding** — one-tap funded demo account and a guided flow.

## How it's built
Next.js 16 (App Router, server actions) · Supabase (Postgres + RLS) · Yahoo Finance market data · Anthropic SDK (encrypted bring-your-own key) · Web Push/VAPID · background crons for scanning, position monitoring, and daily snapshots · deployed on Vercel.

## Why it's different
Most tools give you *one* of: a simulator, a journal, or a screener. Poshkan combines **multi-asset paper trading + a build-it-yourself, one-tap-backtestable strategy lab + an AI coach** in a single free app — and the lab is its defensible core.

---
*See [ROADMAP.md](./ROADMAP.md) for what's next.*
