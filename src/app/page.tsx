import AuthCard from "@/components/auth/AuthCard";

export default function LandingPage() {
  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Left: auth */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
            P
          </div>
          <span className="text-xl font-bold tracking-tight">Poshkan</span>
        </div>
        <div className="flex flex-1 items-center">
          <AuthCard />
        </div>
      </div>

      {/* Right: hero */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-blue-600 to-indigo-800 lg:flex lg:flex-col lg:justify-center lg:px-16 lg:text-white">
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <TickerBackdrop />
        </div>
        <div className="relative z-10 max-w-lg">
          <h1 className="text-5xl font-extrabold leading-tight tracking-tight">
            Trade fearlessly.
            <br />
            Lose nothing.
          </h1>
          <p className="mt-6 text-lg text-white/80">
            Poshkan is your risk-free playground for the US stock market. Start
            with virtual cash, build real instincts — no money on the line.
          </p>
          <ul className="mt-8 space-y-3 text-white/90">
            <li className="flex items-center gap-3">
              <Dot /> Live market prices, zero real risk
            </li>
            <li className="flex items-center gap-3">
              <Dot /> Track holdings, P&amp;L, and a watchlist
            </li>
            <li className="flex items-center gap-3">
              <Dot /> Spin up as many practice accounts as you like
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}

function Dot() {
  return <span className="h-2 w-2 rounded-full bg-white/80" />;
}

function TickerBackdrop() {
  const rows = ["AAPL +1.2%", "TSLA -0.8%", "NVDA +3.4%", "MSFT +0.5%", "AMZN -1.1%", "GOOGL +0.9%"];
  return (
    <div className="flex h-full flex-col justify-around font-mono text-2xl">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="whitespace-nowrap">
          {rows.concat(rows).join("    ")}
        </div>
      ))}
    </div>
  );
}
