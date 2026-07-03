import { createAdminClient } from "@/lib/supabase/admin";
import AdminUsersTable, { type AdminUserRow } from "@/components/admin/AdminUsersTable";

export const dynamic = "force-dynamic";

// One-page owner dashboard: growth & engagement stats, scanner/cron health,
// and a searchable user browser. Read-only — every mutation stays in the app
// or the Supabase dashboard where it's audited.

const DAY = 86_400_000;

interface ScannerHealth {
  name: string;
  enabled: number;
  auto: number;
  signals7d: number;
  lastRun: string | null;
}

function runStatus(lastIso: string | null): { label: string; cls: string } {
  if (!lastIso) return { label: "never ran", cls: "bg-muted/20 text-muted" };
  const mins = (Date.now() - new Date(lastIso).getTime()) / 60_000;
  if (mins < 30) return { label: "healthy", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };
  if (mins < 24 * 60) return { label: `${Math.round(mins / 60)}h ago`, cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
  return { label: `${Math.round(mins / 1440)}d ago`, cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" };
}

async function scannerHealth(
  db: ReturnType<typeof createAdminClient>,
  name: string,
  settingsTable: string,
  signalsTable: string,
  since: string
): Promise<ScannerHealth> {
  const [{ data: settings }, { count: signals7d }, { data: lastRun }] = await Promise.all([
    db.from(settingsTable).select("enabled, mode").eq("enabled", true),
    db.from(signalsTable).select("id", { count: "exact", head: true }).gte("created_at", since),
    db.from(settingsTable).select("last_run_at").order("last_run_at", { ascending: false }).limit(1),
  ]);
  return {
    name,
    enabled: settings?.length ?? 0,
    auto: (settings ?? []).filter((s) => s.mode === "auto").length,
    signals7d: signals7d ?? 0,
    lastRun: lastRun?.[0]?.last_run_at ?? null,
  };
}

export default async function AdminPage() {
  const db = createAdminClient();
  const now = Date.now();
  const d1 = new Date(now - DAY).toISOString();
  const d7 = new Date(now - 7 * DAY).toISOString();
  const d14 = new Date(now - 14 * DAY).toISOString();
  const d30 = new Date(now - 30 * DAY).toISOString();

  const [
    usersRes,
    { data: accounts },
    { data: lastSnapRow },
    { count: fxOpen },
    { count: fxTrades7d },
    { count: stockTrades7d },
    { data: fxRecent },
    { count: pushSubs },
    { count: aiAlerts7d },
    ...scanners
  ] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    db.from("accounts").select("id, user_id, type, cash_balance"),
    db.from("account_snapshots").select("snapshot_date").order("snapshot_date", { ascending: false }).limit(1),
    db.from("fx_positions").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("fx_positions").select("id", { count: "exact", head: true }).gte("opened_at", d7),
    db.from("transactions").select("id", { count: "exact", head: true }).gte("created_at", d7),
    db.from("fx_positions").select("opened_at").gte("opened_at", d14),
    db.from("push_subscriptions").select("id", { count: "exact", head: true }),
    db.from("fx_scan_alerts").select("id", { count: "exact", head: true }).gte("alerted_at", d7),
    scannerHealth(db, "SMC", "smc_settings", "smc_signals", d7),
    scannerHealth(db, "OTE", "ote_settings", "ote_signals", d7),
    scannerHealth(db, "Trend", "trend_settings", "trend_signals", d7),
    scannerHealth(db, "Mean-rev", "meanrev_settings", "meanrev_signals", d7),
    scannerHealth(db, "Candle Range", "candlerange_settings", "candlerange_signals", d7),
  ]);

  const users = usersRes.data?.users ?? [];
  const accs = accounts ?? [];

  // Latest snapshot value per account (equity), falling back to cash.
  const snapDate = lastSnapRow?.[0]?.snapshot_date ?? null;
  const snapByAccount = new Map<string, number>();
  if (snapDate) {
    const { data: snaps } = await db
      .from("account_snapshots")
      .select("account_id, total_value")
      .eq("snapshot_date", snapDate);
    for (const s of snaps ?? []) snapByAccount.set(s.account_id as string, Number(s.total_value));
  }

  // ── Growth & engagement ──
  const newUsers = (since: string) => users.filter((u) => u.created_at >= since).length;
  const activeUsers = (since: string) =>
    users.filter((u) => u.last_sign_in_at && u.last_sign_in_at >= since).length;

  const byType: Record<string, number> = {};
  for (const a of accs) byType[a.type] = (byType[a.type] ?? 0) + 1;

  // Signups per week, last 8 weeks.
  const weeks: { label: string; count: number }[] = [];
  for (let w = 7; w >= 0; w--) {
    const start = now - (w + 1) * 7 * DAY;
    const end = now - w * 7 * DAY;
    weeks.push({
      label: new Date(end).toISOString().slice(5, 10),
      count: users.filter((u) => {
        const t = new Date(u.created_at).getTime();
        return t >= start && t < end;
      }).length,
    });
  }

  // Positions opened per day, last 14 days.
  const days: { label: string; count: number }[] = [];
  for (let d = 13; d >= 0; d--) {
    const key = new Date(now - d * DAY).toISOString().slice(0, 10);
    days.push({
      label: key.slice(5),
      count: (fxRecent ?? []).filter((p) => (p.opened_at as string).slice(0, 10) === key).length,
    });
  }

  // ── User rows ──
  const userRows: AdminUserRow[] = users
    .map((u) => {
      const mine = accs.filter((a) => a.user_id === u.id);
      return {
        id: u.id,
        email: u.email ?? "(no email)",
        createdAt: u.created_at,
        lastSignIn: u.last_sign_in_at ?? null,
        accounts: mine.length,
        equity: mine.reduce((sum, a) => sum + (snapByAccount.get(a.id) ?? Number(a.cash_balance)), 0),
      };
    })
    .sort((a, b) => (b.lastSignIn ?? "").localeCompare(a.lastSignIn ?? ""));

  const snapshotStatus = runStatus(snapDate ? `${snapDate}T22:15:00Z` : null);

  return (
    <div className="mt-4 space-y-6">
      {/* ── Stats ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Growth & engagement</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Total users" value={String(users.length)} />
          <Stat label="New (7d / 30d)" value={`${newUsers(d7)} / ${newUsers(d30)}`} />
          <Stat label="Signed in (1d / 7d / 30d)" value={`${activeUsers(d1)} / ${activeUsers(d7)} / ${activeUsers(d30)}`} />
          <Stat label="Push subscribers" value={String(pushSubs ?? 0)} />
          <Stat
            label="Accounts"
            value={`${accs.length}`}
            sub={Object.entries(byType)
              .map(([t, n]) => `${n} ${t}`)
              .join(" · ")}
          />
          <Stat label="Open positions" value={String(fxOpen ?? 0)} />
          <Stat label="Trades (7d)" value={String((fxTrades7d ?? 0) + (stockTrades7d ?? 0))} sub={`${fxTrades7d ?? 0} fx/crypto · ${stockTrades7d ?? 0} stock`} />
          <Stat label="AI alerts (7d)" value={String(aiAlerts7d ?? 0)} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <BarPanel title="Signups per week" bars={weeks} />
          <BarPanel title="Positions opened per day (14d)" bars={days} />
        </div>
      </section>

      {/* ── Scanner & cron health ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Scanner & cron health</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="bg-muted/10 text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Scanner</th>
                <th className="px-3 py-2 text-right font-medium">Enabled</th>
                <th className="px-3 py-2 text-right font-medium">Auto</th>
                <th className="px-3 py-2 text-right font-medium">Signals (7d)</th>
                <th className="px-3 py-2 font-medium">Last run</th>
              </tr>
            </thead>
            <tbody>
              {(scanners as ScannerHealth[]).map((s) => {
                const st = runStatus(s.lastRun);
                return (
                  <tr key={s.name} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2 text-right">{s.enabled}</td>
                    <td className="px-3 py-2 text-right">{s.auto}</td>
                    <td className="px-3 py-2 text-right">{s.signals7d}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 ${st.cls}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-border">
                <td className="px-3 py-2 font-medium">Daily snapshots</td>
                <td className="px-3 py-2 text-right" colSpan={3}>
                  latest: {snapDate ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 ${snapshotStatus.cls}`}>{snapshotStatus.label}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-muted">
          Scanners tick only while at least one account has them enabled; &quot;never ran&quot; with 0 enabled is
          normal. Stock/forex scanners also pause while their market is closed.
        </p>
      </section>

      {/* ── Users ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Users</h2>
        <AdminUsersTable users={userRows} />
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-bold">{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function BarPanel({ title, bars }: { title: string; bars: { label: string; count: number }[] }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 text-[10px] uppercase tracking-wide text-muted">{title}</div>
      <div className="flex h-24 items-end gap-1">
        {bars.map((b, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-0.5" title={`${b.label}: ${b.count}`}>
            <span className="text-[9px] text-muted">{b.count || ""}</span>
            <div
              className="w-full rounded-t bg-primary/70"
              style={{ height: `${Math.max(b.count ? 6 : 1, (b.count / max) * 70)}px` }}
            />
            {bars.length <= 8 && <span className="text-[8px] text-muted">{b.label}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
