import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";

// Public, indexable landing page for the Poshkan MCP server — the setup guide
// that MCP directory listings point to, and the SEO surface for "trading MCP
// server" queries. The server itself lives at /api/mcp/[transport].

const MCP_URL = "https://www.poshkan.com/api/mcp/mcp";
const PAGE_URL = "https://www.poshkan.com/mcp";

const TITLE = "Poshkan MCP Server — Let Claude Paper-Trade Stocks, Crypto & Forex";
const DESCRIPTION =
  "Connect Claude to Poshkan over MCP and let it read quotes, run technical analysis, and place virtual trades on your paper-trading accounts — stocks, crypto, and leveraged forex. Free, token-authenticated, 100% virtual money.";

const TOOLS: { group: string; items: { name: string; desc: string }[] }[] = [
  {
    group: "Market data",
    items: [
      { name: "get_quote", desc: "Live quote for a stock, ETF, crypto, or forex pair — price, day range, 52-week range." },
      { name: "get_price_history", desc: "OHLC candles with indicators: SMA20/50, RSI14, support/resistance, trend. Intraday to weekly." },
      { name: "search_symbols", desc: "Find tradeable tickers by name, filtered to stocks or crypto." },
    ],
  },
  {
    group: "Accounts",
    items: [
      { name: "list_accounts", desc: "All your paper accounts with type, cash, and holdings count." },
      { name: "get_account", desc: "One account in full: holdings priced live with P&L, pending orders, watchlist." },
      { name: "get_transactions", desc: "Recent buys, sells, deposits, and resets." },
    ],
  },
  {
    group: "Stocks & crypto trading",
    items: [
      { name: "trade", desc: "Market buy or sell at the live price — filled server-side, never at a price Claude invents." },
      { name: "place_limit_order", desc: "Limit order that fills automatically when price reaches your level (GTC or DAY)." },
      { name: "cancel_order", desc: "Cancel a pending limit order." },
    ],
  },
  {
    group: "Leveraged forex",
    items: [
      { name: "open_forex_position", desc: "Open a leveraged long/short with optional stop-loss, take-profit, and timed auto-close." },
      { name: "list_forex_positions", desc: "Open positions with live rates, floating P&L, margin, and SL/TP." },
      { name: "close_forex_position", desc: "Close a position at the live rate and bank the P&L." },
      { name: "place_forex_entry_order", desc: "Pending entry that triggers when the rate hits your level — buy pullbacks, sell rallies." },
      { name: "list_forex_orders", desc: "Pending entry orders with triggers and expiry." },
      { name: "cancel_forex_order", desc: "Cancel a pending entry order." },
    ],
  },
];

const PROMPTS = [
  "Check BTC-USD on the 1-hour chart. If RSI is oversold near support, buy $2,000 worth on my crypto account.",
  "Review my stock account: what's my total P&L, and which holding looks weakest technically?",
  "Open a EUR/USD short, 1 mini lot, stop-loss above the last swing high, take-profit at 2R.",
  "Place limit buys 3% below the current price on my whole watchlist, expiring end of day.",
  "List my open forex positions and close anything with more than $50 floating profit.",
];

const FAQ = [
  {
    q: "Is any real money involved?",
    a: "No. Poshkan is a paper-trading simulator — every account, balance, and trade is 100% virtual. Claude can practice strategies, but nothing real can be won or lost.",
  },
  {
    q: "How does authentication work?",
    a: "You create a personal API token (pk_…) inside the app — settings menu → Claude API access. The server stores only a SHA-256 hash of it, and every tool call is scoped to the accounts of the token's owner. Revoke a token any time from the same menu.",
  },
  {
    q: "Which MCP clients are supported?",
    a: "Any client that speaks streamable HTTP: claude.ai custom connectors, Claude Code, Claude Desktop, and other MCP-compatible clients. No local install — it's a remote server, so setup is pasting one URL.",
  },
  {
    q: "Can Claude make up fill prices?",
    a: "No. Every trade is priced server-side from live market data at execution time, and order fills are claimed atomically. Claude decides what to trade; Poshkan decides the price.",
  },
  {
    q: "What does it cost?",
    a: "Nothing. The account, the MCP server, and the market data are free — no card required.",
  },
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: { title: TITLE, description: DESCRIPTION, url: PAGE_URL, siteName: "Poshkan", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border bg-card p-4 text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

export default function McpPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Poshkan", item: "https://www.poshkan.com" },
          { "@type": "ListItem", position: 2, name: "MCP Server" },
        ],
      },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <nav className="text-sm text-muted">
          <Link href="/" className="hover:text-foreground hover:underline">Poshkan</Link>
          {" / "}MCP Server
        </nav>

        <h1 className="mb-2 mt-4 text-3xl font-bold tracking-tight">🤖 Give Claude a trading account</h1>
        <p className="mb-8 text-lg text-muted">
          The Poshkan MCP server connects Claude to a real-time paper-trading platform: live
          quotes, technical indicators, and broker-style order execution on US stocks, crypto,
          and leveraged forex — all with 100% virtual money.
        </p>

        <div className="space-y-4 text-sm leading-relaxed text-muted [&_strong]:text-foreground">
          <p>
            Ask Claude to analyze a chart and it can pull the candles itself. Ask it to act on the
            analysis and it can place the trade — a market order, a limit order at a better price,
            or a leveraged forex position with a stop-loss and take-profit attached. Because every
            dollar is virtual, it&apos;s a consequence-free sandbox for AI-assisted trading:
            strategy experiments, portfolio reviews, or a morning &quot;check my positions&quot;
            routine.
          </p>

          <h2 className="pt-4 text-lg font-bold text-foreground">Things you can ask Claude</h2>
          <ul className="list-disc space-y-2 pl-5">
            {PROMPTS.map((p) => (
              <li key={p}>&quot;{p}&quot;</li>
            ))}
          </ul>

          <h2 className="pt-4 text-lg font-bold text-foreground">Setup — about two minutes</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <Link href="/" className="underline hover:text-foreground">Create a free Poshkan account</Link>{" "}
              (no card) and add a paper-trading account or two — stocks, crypto, or forex.
            </li>
            <li>
              In the app, open the settings menu (top right) → <strong>Claude API access</strong> →
              create a token. It starts with <code className="rounded bg-card px-1">pk_</code> and is
              shown once — copy it.
            </li>
            <li>Connect your client below.</li>
          </ol>

          <h3 className="pt-2 font-semibold text-foreground">claude.ai (web & desktop)</h3>
          <p>
            Settings → Connectors → <strong>Add custom connector</strong>, and paste this URL with
            your token:
          </p>
          <Code>{`${MCP_URL}?key=pk_YOUR_TOKEN`}</Code>

          <h3 className="pt-2 font-semibold text-foreground">Claude Code</h3>
          <Code>{`claude mcp add poshkan --transport http "${MCP_URL}" \\
  --header "Authorization: Bearer pk_YOUR_TOKEN"`}</Code>

          <h3 className="pt-2 font-semibold text-foreground">Any other MCP client</h3>
          <p>
            It&apos;s a remote server over streamable HTTP — endpoint{" "}
            <code className="rounded bg-card px-1">{MCP_URL}</code>, authenticated with{" "}
            <code className="rounded bg-card px-1">Authorization: Bearer pk_…</code> or{" "}
            <code className="rounded bg-card px-1">?key=pk_…</code>. Nothing to install.
          </p>

          <h2 className="pt-4 text-lg font-bold text-foreground">The 15 tools</h2>
          {TOOLS.map((g) => (
            <div key={g.group}>
              <h3 className="mb-2 mt-4 font-semibold text-foreground">{g.group}</h3>
              <dl className="space-y-2">
                {g.items.map((t) => (
                  <div key={t.name} className="rounded-xl border border-border bg-card/50 p-3">
                    <dt className="font-mono text-xs font-semibold text-foreground">{t.name}</dt>
                    <dd className="mt-1">{t.desc}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}

          <h2 className="pt-4 text-lg font-bold text-foreground">Built to be safe to hand to an AI</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Virtual money only.</strong> No deposits, no withdrawals, no broker
              connection — the worst case is a bruised virtual ego.
            </li>
            <li>
              <strong>Server-side prices.</strong> Fills always use live market data fetched by the
              server at execution time; a confused model can&apos;t invent a fill price.
            </li>
            <li>
              <strong>User-scoped tokens.</strong> Tokens are stored as SHA-256 hashes, every call
              is checked against the token owner&apos;s accounts, and you can revoke a token in one
              click.
            </li>
            <li>
              <strong>Real trading rules.</strong> Asset-class limits, margin requirements,
              stop-outs, and order validation are enforced by the same code that runs the app.
            </li>
          </ul>

          <h2 className="pt-4 text-lg font-bold text-foreground">Frequently asked questions</h2>
          <dl className="space-y-4">
            {FAQ.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold text-foreground">{f.q}</dt>
                <dd className="mt-1">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* CTA */}
        <div className="mt-10 rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="font-semibold">Ready in two minutes</h2>
          <p className="mt-1 text-sm text-muted">
            Create a free account, mint a token from the settings menu, paste one URL into Claude —
            and ask it to check the markets.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Create a free account
          </Link>
        </div>

        <p className="mt-10 border-t border-border pt-4 text-xs text-muted">
          Poshkan is a paper-trading simulator — all money, trades, and returns are 100% virtual,
          and nothing here is financial advice. Market data may be delayed or inaccurate.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
