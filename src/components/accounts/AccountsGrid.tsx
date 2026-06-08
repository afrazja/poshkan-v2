"use client";

import { useState } from "react";
import Link from "next/link";
import type { Account } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import CreateAccountModal from "./CreateAccountModal";

export default function AccountsGrid({
  accounts,
  summary,
}: {
  accounts: Account[];
  summary: Record<string, { invested: number; holdings: number }>;
}) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((acc) => {
          const s = summary[acc.id] ?? { invested: 0, holdings: 0 };
          const total = Number(acc.cash_balance) + s.invested;
          return (
            <Link
              key={acc.id}
              href={`/dashboard/${acc.id}`}
              className="group rounded-2xl border border-border bg-card p-5 transition hover:border-primary hover:shadow-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">{acc.name}</h3>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium capitalize text-muted">
                  {acc.type}
                </span>
              </div>
              <div className="text-2xl font-bold">{formatCurrency(total)}</div>
              <div className="mt-1 text-xs text-muted">account value (cost basis)</div>
              <div className="mt-4 flex justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted">
                  Cash <span className="text-foreground">{formatCurrency(Number(acc.cash_balance))}</span>
                </span>
                <span className="text-muted">
                  {s.holdings} holding{s.holdings === 1 ? "" : "s"}
                </span>
              </div>
            </Link>
          );
        })}

        {/* + create card */}
        <button
          onClick={() => setShowCreate(true)}
          className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-muted transition hover:border-primary hover:text-primary"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-current text-2xl">
            +
          </span>
          <span className="text-sm font-medium">New account</span>
        </button>
      </div>

      {showCreate && <CreateAccountModal onClose={() => setShowCreate(false)} />}
    </>
  );
}
