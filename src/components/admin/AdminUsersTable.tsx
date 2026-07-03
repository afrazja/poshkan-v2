"use client";

import { useState } from "react";

export interface AdminUserRow {
  id: string;
  email: string;
  createdAt: string;
  lastSignIn: string | null;
  accounts: number;
  equity: number;
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");

const agoDays = (iso: string | null) => {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d}d ago`;
};

export default function AdminUsersTable({ users }: { users: AdminUserRow[] }) {
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? users.filter((u) => u.email.toLowerCase().includes(q.trim().toLowerCase()))
    : users;

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by email…"
        className="mb-2 w-full max-w-xs rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
      />
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="bg-muted/10 text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 font-medium">Last sign-in</th>
              <th className="px-3 py-2 text-right font-medium">Accounts</th>
              <th className="px-3 py-2 text-right font-medium">Equity</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{u.email}</td>
                <td className="px-3 py-2 text-muted">{fmtDate(u.createdAt)}</td>
                <td className="px-3 py-2 text-muted" title={fmtDate(u.lastSignIn)}>
                  {agoDays(u.lastSignIn)}
                </td>
                <td className="px-3 py-2 text-right">{u.accounts}</td>
                <td className="px-3 py-2 text-right">
                  ${u.equity.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted">
                  No users match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {filtered.length} of {users.length} users · equity = latest daily snapshot (cash if none yet)
      </p>
    </div>
  );
}
