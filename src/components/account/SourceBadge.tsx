// Badge showing which scanner opened a position (or "Manual" if the user did).
export default function SourceBadge({ source }: { source?: string | null }) {
  const labels: Record<string, string> = {
    ai: "🤖 AI",
    smc: "📈 SMC",
    ote: "🎯 OTE",
    trend: "🚀 Trend",
    meanrev: "↩️ Mean Rev",
    candlerange: "📦 Range",
  };
  const label = source ? labels[source] ?? source : "👤 Manual";
  return (
    <span className="ml-1 whitespace-nowrap rounded-md bg-muted/20 px-1.5 py-0.5 text-[10px] font-medium text-muted">
      {label}
    </span>
  );
}
