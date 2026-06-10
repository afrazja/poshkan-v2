import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/format";
import JournalReview from "@/components/JournalReview";

interface Entry {
  id: string;
  account_id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  note: string;
  created_at: string;
}

export default async function JournalPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("journal_entries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const entries = (data ?? []) as Entry[];

  const { data: accounts } = await supabase.from("accounts").select("id, name");
  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">📓 Trade journal</h1>
          <p className="text-sm text-muted">
            The reasoning behind your trades. Add a note in the trade confirmation — then let the
            AI coach review your thinking against the outcomes.
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-muted hover:text-foreground hover:underline">
          ← Your accounts
        </Link>
      </div>

      <div className="mb-6">
        <JournalReview />
      </div>

      {error ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          The journal isn&apos;t set up yet — run <code>supabase/push-journal.sql</code> in the
          Supabase SQL editor.
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          No entries yet. The next time you buy or sell, fill in the &quot;Why this trade?&quot;
          box on the review screen.
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <div key={e.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                    e.side === "BUY" ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
                  }`}
                >
                  {e.side}
                </span>
                <span className="font-semibold">
                  {Number(e.quantity)} × {e.symbol}
                </span>
                <span className="text-muted">@ {formatCurrency(Number(e.price))}</span>
                <span className="ml-auto text-xs text-muted">
                  {new Date(e.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {" · "}
                  {accountName.get(e.account_id) ?? "account"}
                </span>
              </div>
              <p className="text-sm leading-relaxed">{e.note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
