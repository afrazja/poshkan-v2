"use client";

export type ScannerStatusFilter = "all" | "enabled" | "off";
export type ScannerAssetFilter = "all" | "stocks" | "crypto" | "forex";
export type ScannerSort = "default" | "enabled" | "recent";

// Search/filter/sort toolbar for the scanner card list. Purely controlled —
// state lives in the parent so it can drive which cards render and in what
// order (live, no submit step).
export default function ScannerFilterBar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  assetClass,
  onAssetClassChange,
  sort,
  onSortChange,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  status: ScannerStatusFilter;
  onStatusChange: (v: ScannerStatusFilter) => void;
  assetClass: ScannerAssetFilter;
  onAssetClassChange: (v: ScannerAssetFilter) => void;
  sort: ScannerSort;
  onSortChange: (v: ScannerSort) => void;
}) {
  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-medium transition ${
      active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:bg-background"
    }`;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search scanners…"
        aria-label="Search scanners"
        className="w-full rounded-lg border border-border bg-input px-3 py-1.5 text-sm outline-none focus:border-primary sm:w-52"
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted">Status</span>
          {(["all", "enabled", "off"] as const).map((s) => (
            <button key={s} onClick={() => onStatusChange(s)} className={chip(status === s)}>
              {s === "all" ? "All" : s === "enabled" ? "Enabled" : "Off"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted">Asset</span>
          {(["all", "stocks", "crypto", "forex"] as const).map((a) => (
            <button key={a} onClick={() => onAssetClassChange(a)} className={chip(assetClass === a)}>
              {a === "all" ? "All" : a[0].toUpperCase() + a.slice(1)}
            </button>
          ))}
        </div>

        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as ScannerSort)}
          aria-label="Sort scanners"
          className="rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none focus:border-primary"
        >
          <option value="default">Default order</option>
          <option value="enabled">Enabled first</option>
          <option value="recent">Most recently run</option>
        </select>
      </div>
    </div>
  );
}
