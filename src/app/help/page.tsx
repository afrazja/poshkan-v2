import Link from "next/link";

export const metadata = {
  title: "Help & Guide — Poshkan",
  description:
    "How Poshkan works: accounts, order types, forex lots and leverage, P&L definitions, the AI coach, alerts, and the leaderboard.",
};

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-2 mt-10 scroll-mt-20 text-lg font-bold tracking-tight first:mt-0">
      {children}
    </h2>
  );
}

function Term({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <p className="mt-2">
      <strong>{name}</strong> — {children}
    </p>
  );
}

export default function HelpPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-muted hover:text-foreground hover:underline">
        ← Back to Poshkan
      </Link>
      <h1 className="mb-1 mt-4 text-2xl font-bold tracking-tight">Help &amp; quick guide</h1>
      <p className="mb-6 text-sm text-muted">
        Everything in Poshkan is virtual — practice freely, nothing is real money.
      </p>

      {/* mini table of contents */}
      <nav className="mb-4 flex flex-wrap gap-2 text-xs">
        {[
          ["basics", "Basics"],
          ["orders", "Order types"],
          ["forex", "Forex"],
          ["pnl", "P&L"],
          ["coach", "AI coach"],
          ["alerts", "Alerts"],
          ["leaderboard", "Leaderboard"],
          ["claude", "Claude connector"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-border px-3 py-1 text-muted hover:text-foreground">
            {label}
          </a>
        ))}
      </nav>

      <div className="text-sm leading-relaxed text-muted [&_strong]:text-foreground">
        <H id="basics">The basics</H>
        <p>
          Create one or more <strong>trading accounts</strong> (stocks, crypto, or forex), fund
          each with virtual cash, and trade with live market prices. Each account is independent —
          its own cash, holdings, and history. You can add more virtual cash or reset an account
          anytime (reset wipes its history and starts fresh).
        </p>
        <p className="mt-2">
          Account types are enforced: a stocks account trades stocks &amp; ETFs, a crypto account
          trades coins (like BTC-USD), a forex account trades currency pairs. Selling is always
          allowed, so you can never get stuck holding something.
        </p>

        <H id="orders">Order types</H>
        <Term name="Market order">executes immediately at the current live price.</Term>
        <Term name="Limit order">
          waits until the price reaches your level — a buy fills at or below your limit, a sell at
          or above it. Poshkan&apos;s background workers fill limit orders even while you&apos;re
          offline, and you get a notification.
        </Term>
        <Term name="Day vs GTC">
          a <strong>Day</strong> order expires at the end of the trading day if unfilled;{" "}
          <strong>GTC</strong> (good-til-canceled) waits until it fills or you cancel it.
        </Term>

        <H id="forex">Forex (currency pairs)</H>
        <p>
          Forex works differently from stocks — you trade <strong>pairs</strong> like EUR/USD and
          can profit from prices falling (<strong>short</strong>) as well as rising
          (<strong>long</strong>).
        </p>
        <Term name="Lots">
          position sizes: micro = 1,000 units, mini = 10,000, standard = 100,000.
        </Term>
        <Term name="Leverage & margin">
          You choose your leverage (30:1 up to 500:1) when you create a forex account. At 30:1,
          opening a 10,000-unit position reserves about 1/30 of its value from your cash as{" "}
          <strong>margin</strong>; higher leverage reserves less, so the same cash controls bigger
          positions — amplifying both gains and losses. 30:1 matches EU/UK retail brokers.
        </Term>
        <Term name="Pip">
          the smallest common price step (0.0001 for most pairs). Your P&amp;L per pip = units ×
          0.0001.
        </Term>
        <Term name="Stop-out">
          if a position&apos;s loss reaches the margin you reserved, it closes automatically — so
          your account can never go below zero.
        </Term>
        <Term name="Stop-loss / take-profit">
          optional exit levels on each position: stop-loss caps your loss, take-profit locks in a
          gain. Set them when opening or edit them on the open position.
        </Term>
        <Term name="Entry orders">
          &quot;open this position when the rate reaches X&quot; — the forex version of a limit
          order, with optional expiry.
        </Term>

        <H id="pnl">P&amp;L — the numbers explained</H>
        <Term name="Today's P&L">how much your holdings moved since yesterday&apos;s close.</Term>
        <Term name="Unrealized P&L">
          paper profit on what you still hold: (current price − your average cost) × quantity.
        </Term>
        <Term name="Realized P&L">
          profit you locked in by selling. Selling above your average cost realizes a gain — it
          stops moving with the market.
        </Term>
        <Term name="Buying power">cash available for new purchases.</Term>

        <H id="coach">The journal &amp; AI coach</H>
        <p>
          When you place a trade, the review screen has a{" "}
          <strong>📓 &quot;Why this trade?&quot;</strong> box. Write one honest line about your
          reasoning. Later, on the <strong>Journal</strong> page, the AI coach reads your notes
          against how each trade actually played out and tells you what&apos;s working and what to
          fix — it judges your <em>reasoning</em>, not just your results. Reviews are limited to a
          few per day.
        </p>

        <H id="alerts">Alerts &amp; notifications</H>
        <p>
          Open any stock and tap <strong>🔔 Set alert</strong> with a target price. When it hits,
          you get a banner on your dashboard, an email, and — if you enabled notifications in
          settings — a push notification on your device. Order fills push too. Installing Poshkan
          as an app (see the bottom of the home page) makes notifications land on your lock
          screen.
        </p>

        <H id="leaderboard">Leaderboard</H>
        <p>
          Every account is ranked by <strong>% return on the money put in</strong> — not by total
          value, so depositing more virtual cash doesn&apos;t buy rank, and resetting an account
          restarts its history. Your username and your accounts&apos; virtual returns are visible
          to other users there.
        </p>

        <H id="claude">Claude connector (advanced)</H>
        <p>
          Settings → <strong>Claude API access</strong> creates a personal token that lets the
          Claude AI assistant read your portfolio and trade on your instruction via MCP. Treat
          tokens like passwords; revoke them anytime in the same menu.
        </p>

        <p className="mt-10 border-t border-border pt-4 text-xs">
          Still confused by something? That&apos;s feedback we want — mention it on the page you
          found it. And remember: it&apos;s all practice money. The best way to learn is to try
          things.
        </p>
      </div>
    </main>
  );
}
