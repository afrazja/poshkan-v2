import ScannerIcon, { type ScannerKind } from "@/components/ScannerIcon";

// Badge showing which scanner opened a position (or "Manual" if the user did).
const LABELS: Record<string, { kind: ScannerKind; label: string }> = {
  ai: { kind: "ai", label: "AI" },
  smc: { kind: "smc", label: "SMC" },
  ote: { kind: "ote", label: "OTE" },
  trend: { kind: "trend", label: "Trend" },
  meanrev: { kind: "meanrev", label: "Mean Rev" },
  candlerange: { kind: "candlerange", label: "Range" },
};

export default function SourceBadge({ source }: { source?: string | null }) {
  const entry = source ? LABELS[source] : undefined;
  return (
    <span className="ml-1 inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-muted/20 px-1.5 py-0.5 align-middle text-[10px] font-medium text-muted">
      <ScannerIcon kind={entry?.kind ?? "manual"} size={11} />
      {entry?.label ?? (source || "Manual")}
    </span>
  );
}
