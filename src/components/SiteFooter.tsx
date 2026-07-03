import Link from "next/link";

// Persistent simulator disclaimer + legal links, shown on every page.
export default function SiteFooter() {
  return (
    <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted">
      <p>
        <strong className="text-foreground">Poshkan is a paper-trading simulator.</strong> All
        money, trades, and returns are 100% virtual — nothing is real, nothing can be won or
        lost, and nothing here is financial advice.
      </p>
      <p className="mt-1">
        Market data may be delayed or inaccurate ·{" "}
        <Link href="/how-it-works" className="underline hover:text-foreground">
          How it works
        </Link>{" "}
        ·{" "}
        <Link href="/strategies" className="underline hover:text-foreground">
          Strategies
        </Link>{" "}
        ·{" "}
        <Link href="/learn" className="underline hover:text-foreground">
          Learn
        </Link>{" "}
        ·{" "}
        <Link href="/help" className="underline hover:text-foreground">
          Help
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="underline hover:text-foreground">
          Terms
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="underline hover:text-foreground">
          Privacy
        </Link>
      </p>
    </footer>
  );
}
