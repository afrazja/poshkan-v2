import { createHash } from "node:crypto";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuote, getQuotes, searchSymbols, getTimeSeries } from "@/lib/marketdata";
import { assetTypeError } from "@/lib/assets";
import { marginFor, sltpError, floatingPnl, isForexSymbol, pairName } from "@/lib/forex";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Poshkan MCP server: lets Claude (claude.ai connectors / Claude Code) act on
// the token owner's paper-trading accounts. Authentication: a personal API
// token (Authorization: Bearer <token> or ?key=<token>), created in the app's
// settings menu and stored as a SHA-256 hash. Every tool re-verifies that the
// target account belongs to the token's user.
// ---------------------------------------------------------------------------

async function authenticate(req: Request): Promise<string | null> {
  try {
    const url = new URL(req.url);
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const token = bearer || url.searchParams.get("key");
    if (!token || !token.startsWith("pk_")) return null;

    const hash = createHash("sha256").update(token).digest("hex");
    const db = createAdminClient();
    const { data } = await db
      .from("api_tokens")
      .select("id, user_id")
      .eq("token_hash", hash)
      .single();
    if (!data) return null;
    // Fire-and-forget usage stamp.
    void db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
    return data.user_id;
  } catch {
    return null; // missing service key / table not migrated — treat as unauthorized
  }
}

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const err = (message: string) => ({
  content: [{ type: "text" as const, text: `Error: ${message}` }],
  isError: true,
});

function buildHandler(userId: string) {
  const db = createAdminClient();

  // Account must belong to the token's user — every mutating tool goes through this.
  async function ownAccount(accountId: string) {
    const { data } = await db
      .from("accounts")
      .select("id, user_id, name, type, cash_balance")
      .eq("id", accountId)
      .single();
    if (!data || data.user_id !== userId) return null;
    return data;
  }

  return createMcpHandler(
    (server) => {
      server.tool(
        "list_accounts",
        "List the user's paper-trading accounts with type, cash balance, and holdings count.",
        {},
        async () => {
          const { data: accounts } = await db
            .from("accounts")
            .select("id, name, type, cash_balance, created_at")
            .eq("user_id", userId)
            .order("created_at");
          const { data: positions } = await db
            .from("positions")
            .select("account_id")
            .in("account_id", (accounts ?? []).map((a) => a.id));
          const counts: Record<string, number> = {};
          for (const p of positions ?? []) counts[p.account_id] = (counts[p.account_id] ?? 0) + 1;
          return ok(
            (accounts ?? []).map((a) => ({
              account_id: a.id,
              name: a.name,
              type: a.type,
              cash: Number(a.cash_balance),
              holdings: counts[a.id] ?? 0,
            }))
          );
        }
      );

      server.tool(
        "get_account",
        "Get one account in full: cash, holdings priced live (with P&L), pending limit orders, and watchlist.",
        { account_id: z.string().uuid() },
        async ({ account_id }) => {
          const account = await ownAccount(account_id);
          if (!account) return err("Account not found");
          const [{ data: positions }, { data: orders }, { data: watchlist }] = await Promise.all([
            db.from("positions").select("symbol, quantity, avg_cost").eq("account_id", account_id),
            db
              .from("orders")
              .select("id, symbol, side, quantity, limit_price, time_in_force, created_at")
              .eq("account_id", account_id)
              .eq("status", "pending"),
            db.from("watchlist").select("symbol").eq("account_id", account_id),
          ]);
          const symbols = (positions ?? []).map((p) => p.symbol.toUpperCase());
          const quotes = symbols.length ? await getQuotes(symbols) : {};
          const holdings = (positions ?? []).map((p) => {
            const q = quotes[p.symbol.toUpperCase()];
            const qty = Number(p.quantity);
            const avg = Number(p.avg_cost);
            const price = q?.price ?? avg;
            return {
              symbol: p.symbol,
              quantity: qty,
              avg_cost: avg,
              current_price: price,
              market_value: +(qty * price).toFixed(2),
              unrealized_pnl: +((price - avg) * qty).toFixed(2),
            };
          });
          const holdingsValue = holdings.reduce((s, h) => s + h.market_value, 0);
          return ok({
            account_id: account.id,
            name: account.name,
            type: account.type,
            cash: Number(account.cash_balance),
            total_value: +(Number(account.cash_balance) + holdingsValue).toFixed(2),
            holdings,
            pending_orders: orders ?? [],
            watchlist: (watchlist ?? []).map((w) => w.symbol),
          });
        }
      );

      server.tool(
        "get_quote",
        "Get a live quote for a stock, ETF, crypto (BTC-USD), or forex pair (EURUSD=X). Includes price, day range, and 52-week range.",
        { symbol: z.string().min(1) },
        async ({ symbol }) => {
          try {
            return ok(await getQuote(symbol));
          } catch (e) {
            return err(`Quote failed: ${(e as Error).message}`);
          }
        }
      );

      server.tool(
        "get_price_history",
        "Get recent price history (the same candles the chart draws) for a stock, ETF, crypto (BTC-USD), or forex pair (EURUSD=X). Use this to analyze trend, momentum, and support/resistance. interval: '1day' (default), '1week', or intraday '5min'/'15min'/'1h'. limit = number of points (default 90).",
        {
          symbol: z.string().min(1),
          interval: z.enum(["5min", "15min", "1h", "1day", "1week"]).optional(),
          limit: z.number().int().min(2).max(400).optional(),
        },
        async ({ symbol, interval, limit }) => {
          try {
            const candles = await getTimeSeries(symbol, interval ?? "1day", limit ?? 90);
            if (!candles.length) return err("No price history available for that symbol");
            const closes = candles.map((c) => c.close);
            const first = closes[0];
            const last = closes[closes.length - 1];
            return ok({
              symbol: symbol.toUpperCase(),
              interval: interval ?? "1day",
              points: candles.length,
              summary: {
                first,
                last,
                high: Math.max(...closes),
                low: Math.min(...closes),
                change_pct: +(((last - first) / first) * 100).toFixed(2),
              },
              candles,
            });
          } catch (e) {
            return err(`History failed: ${(e as Error).message}`);
          }
        }
      );

      server.tool(
        "search_symbols",
        "Search tradeable symbols by name or ticker. Optional asset_type filters to 'stocks' or 'crypto'.",
        { query: z.string().min(1), asset_type: z.enum(["stocks", "crypto"]).optional() },
        async ({ query, asset_type }) => {
          try {
            let results = await searchSymbols(query);
            if (asset_type === "crypto") results = results.filter((r) => r.instrumentType === "CRYPTOCURRENCY");
            else if (asset_type === "stocks") results = results.filter((r) => r.instrumentType !== "CRYPTOCURRENCY");
            return ok(results.slice(0, 10));
          } catch (e) {
            return err(`Search failed: ${(e as Error).message}`);
          }
        }
      );

      server.tool(
        "trade",
        "Execute a MARKET buy or sell immediately at the live price on one of the user's accounts. Crypto accounts trade crypto only; stock accounts trade stocks/ETFs only. Selling requires holding enough units.",
        {
          account_id: z.string().uuid(),
          symbol: z.string().min(1),
          side: z.enum(["BUY", "SELL"]),
          quantity: z.number().positive(),
        },
        async ({ account_id, symbol, side, quantity }) => {
          const account = await ownAccount(account_id);
          if (!account) return err("Account not found");
          if (account.type === "forex") return err("Forex accounts are not supported over MCP yet");
          if (side === "BUY") {
            const typeErr = assetTypeError(account.type, symbol);
            if (typeErr) return err(typeErr);
          }
          let price: number;
          try {
            price = (await getQuote(symbol)).price;
            if (!price || price <= 0) return err("Could not get a valid price");
          } catch (e) {
            return err(`Price fetch failed: ${(e as Error).message}`);
          }
          const { error } = await db.rpc("execute_trade", {
            p_account_id: account_id,
            p_symbol: symbol.toUpperCase(),
            p_side: side,
            p_quantity: quantity,
            p_price: price,
          });
          if (error) return err(error.message);
          return ok({
            executed: true,
            side,
            symbol: symbol.toUpperCase(),
            quantity,
            fill_price: price,
            total: +(quantity * price).toFixed(2),
          });
        }
      );

      server.tool(
        "place_limit_order",
        "Place a LIMIT order that fills automatically when the price reaches the limit (BUY fills at or below; SELL at or above). time_in_force: GTC (default) or DAY (expires at end of day).",
        {
          account_id: z.string().uuid(),
          symbol: z.string().min(1),
          side: z.enum(["BUY", "SELL"]),
          quantity: z.number().positive(),
          limit_price: z.number().positive(),
          time_in_force: z.enum(["GTC", "DAY"]).optional(),
        },
        async ({ account_id, symbol, side, quantity, limit_price, time_in_force }) => {
          const account = await ownAccount(account_id);
          if (!account) return err("Account not found");
          if (account.type === "forex") return err("Forex accounts are not supported over MCP yet");
          if (side === "BUY") {
            const typeErr = assetTypeError(account.type, symbol);
            if (typeErr) return err(typeErr);
          }
          const { data, error } = await db
            .from("orders")
            .insert({
              account_id,
              symbol: symbol.toUpperCase(),
              side,
              quantity,
              limit_price,
              time_in_force: time_in_force === "DAY" ? "DAY" : "GTC",
            })
            .select("id")
            .single();
          if (error) return err(error.message);
          return ok({ placed: true, order_id: data.id, side, symbol: symbol.toUpperCase(), quantity, limit_price });
        }
      );

      server.tool(
        "cancel_order",
        "Cancel a pending limit order by its order_id.",
        { account_id: z.string().uuid(), order_id: z.string().uuid() },
        async ({ account_id, order_id }) => {
          const account = await ownAccount(account_id);
          if (!account) return err("Account not found");
          const { data, error } = await db
            .from("orders")
            .update({ status: "canceled" })
            .eq("id", order_id)
            .eq("account_id", account_id)
            .eq("status", "pending")
            .select("id");
          if (error) return err(error.message);
          if (!data?.length) return err("No pending order with that id");
          return ok({ canceled: true, order_id });
        }
      );

      server.tool(
        "get_transactions",
        "Get an account's most recent transactions (buys, sells, deposits, resets). Newest first.",
        { account_id: z.string().uuid(), limit: z.number().int().min(1).max(100).optional() },
        async ({ account_id, limit }) => {
          const account = await ownAccount(account_id);
          if (!account) return err("Account not found");
          const { data } = await db
            .from("transactions")
            .select("created_at, side, symbol, quantity, price, cash_delta")
            .eq("account_id", account_id)
            .order("created_at", { ascending: false })
            .limit(limit ?? 25);
          return ok(data ?? []);
        }
      );

      server.tool(
        "open_forex_position",
        "Open a leveraged forex position at the live rate on a FOREX account. symbol is a pair like EURUSD=X. units = position size (10000 = 1 mini lot). Optional stop_loss / take_profit prices, and auto_close_minutes for a timed exit. Margin is reserved from cash using the account's leverage.",
        {
          account_id: z.string().uuid(),
          symbol: z.string().min(1),
          direction: z.enum(["LONG", "SHORT"]),
          units: z.number().positive(),
          stop_loss: z.number().positive().optional(),
          take_profit: z.number().positive().optional(),
          auto_close_minutes: z.number().int().positive().optional(),
        },
        async ({ account_id, symbol, direction, units, stop_loss, take_profit, auto_close_minutes }) => {
          const account = await ownAccount(account_id);
          if (!account) return err("Account not found");
          if (account.type !== "forex") return err("This tool is for forex accounts only");
          if (!isForexSymbol(symbol)) return err("Symbol must be a forex pair, e.g. EURUSD=X");
          let rate: number;
          try {
            rate = (await getQuote(symbol)).price;
            if (!rate || rate <= 0) return err("Could not get a valid rate");
          } catch (e) {
            return err(`Rate fetch failed: ${(e as Error).message}`);
          }
          const sl = stop_loss ?? null;
          const tp = take_profit ?? null;
          const slErr = sltpError(direction, rate, sl, tp);
          if (slErr) return err(slErr);
          const { data: acc } = await db.from("accounts").select("leverage").eq("id", account_id).single();
          const leverage = (acc as { leverage?: number } | null)?.leverage;
          const margin = marginFor(units, rate, leverage, symbol);
          const { data: posId, error } = await db.rpc("fx_open", {
            p_account_id: account_id,
            p_symbol: symbol.toUpperCase(),
            p_direction: direction,
            p_units: units,
            p_rate: rate,
            p_margin: margin,
            p_stop_loss: sl,
            p_take_profit: tp,
          });
          if (error) return err(error.message);
          let timedClose = false;
          if (auto_close_minutes && auto_close_minutes > 0 && posId) {
            const { error: acErr } = await db.rpc("fx_set_auto_close", {
              p_position_id: posId,
              p_minutes: Math.round(auto_close_minutes),
            });
            timedClose = !acErr;
          }
          return ok({
            opened: true,
            position_id: posId,
            pair: pairName(symbol),
            direction,
            units,
            open_rate: rate,
            margin,
            leverage: leverage ?? 30,
            auto_close_minutes: timedClose ? auto_close_minutes : null,
          });
        }
      );

      server.tool(
        "list_forex_positions",
        "List open forex positions on a forex account, with live rate, floating P&L (USD), margin, SL/TP, and any auto-close time.",
        { account_id: z.string().uuid() },
        async ({ account_id }) => {
          const account = await ownAccount(account_id);
          if (!account) return err("Account not found");
          const { data: positions } = await db
            .from("fx_positions")
            .select("id, symbol, direction, units, open_rate, margin, stop_loss, take_profit, auto_close_at")
            .eq("account_id", account_id)
            .eq("status", "open");
          if (!positions?.length) return ok([]);
          const symbols = Array.from(new Set(positions.map((p) => p.symbol.toUpperCase())));
          const quotes = await getQuotes(symbols);
          return ok(
            positions.map((p) => {
              const q = quotes[p.symbol.toUpperCase()];
              const rate = q?.price;
              const fl = rate
                ? floatingPnl(p.direction as "LONG" | "SHORT", Number(p.units), Number(p.open_rate), rate, p.symbol)
                : null;
              return {
                position_id: p.id,
                pair: pairName(p.symbol),
                direction: p.direction,
                units: Number(p.units),
                open_rate: Number(p.open_rate),
                current_rate: rate ?? null,
                floating_pnl: fl != null ? +fl.toFixed(2) : null,
                margin: Number(p.margin),
                stop_loss: p.stop_loss,
                take_profit: p.take_profit,
                auto_close_at: p.auto_close_at,
              };
            })
          );
        }
      );

      server.tool(
        "close_forex_position",
        "Close an open forex position at the live rate, banking its P&L. Use list_forex_positions to get the position_id.",
        { account_id: z.string().uuid(), position_id: z.string().uuid() },
        async ({ account_id, position_id }) => {
          const account = await ownAccount(account_id);
          if (!account) return err("Account not found");
          const { data: pos } = await db
            .from("fx_positions")
            .select("symbol")
            .eq("id", position_id)
            .eq("account_id", account_id)
            .eq("status", "open")
            .single();
          if (!pos) return err("No open position with that id");
          let rate: number;
          try {
            rate = (await getQuote(pos.symbol)).price;
            if (!rate || rate <= 0) return err("Could not get a valid rate");
          } catch (e) {
            return err(`Rate fetch failed: ${(e as Error).message}`);
          }
          const { data: pnl, error } = await db.rpc("fx_close", {
            p_position_id: position_id,
            p_rate: rate,
            p_reason: "closed",
          });
          if (error) return err(error.message);
          return ok({ closed: true, position_id, close_rate: rate, pnl: pnl != null ? +Number(pnl).toFixed(2) : null });
        }
      );
    },
    {},
    { basePath: "/api/mcp", verboseLogs: false }
  );
}

async function handler(req: Request) {
  const userId = await authenticate(req);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Unauthorized — pass your Poshkan API token as 'Authorization: Bearer pk_…' or '?key=pk_…'" }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }
  return buildHandler(userId)(req);
}

export { handler as GET, handler as POST, handler as DELETE };
