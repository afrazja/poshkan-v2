// Shown while a dashboard route fetches its data (accounts, live quotes, …),
// so navigation never lands on a frozen blank screen.
export default function DashboardLoading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3 text-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        <p className="text-sm">Loading your dashboard…</p>
      </div>
    </div>
  );
}
