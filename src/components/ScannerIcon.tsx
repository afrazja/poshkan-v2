import { Bot, ChartCandlestick, Crosshair, Rocket, Undo2, Box, User } from "lucide-react";

// One consistent, per-scanner icon + identity color, replacing the emoji set
// (📈🎯🚀↩️📦🤖) that rendered differently on every OS. Keep the colors stable:
// they're each scanner's visual identity across cards, feeds, and badges.
export type ScannerKind = "ai" | "smc" | "ote" | "trend" | "meanrev" | "candlerange" | "manual";

const MAP: Record<ScannerKind, { Icon: typeof Bot; cls: string }> = {
  ai: { Icon: Bot, cls: "text-violet-500" },
  smc: { Icon: ChartCandlestick, cls: "text-sky-500" },
  ote: { Icon: Crosshair, cls: "text-rose-500" },
  trend: { Icon: Rocket, cls: "text-orange-500" },
  meanrev: { Icon: Undo2, cls: "text-teal-500" },
  candlerange: { Icon: Box, cls: "text-amber-500" },
  manual: { Icon: User, cls: "text-muted" },
};

export default function ScannerIcon({
  kind,
  size = 16,
  className = "",
}: {
  kind: ScannerKind;
  size?: number;
  className?: string;
}) {
  const { Icon, cls } = MAP[kind] ?? MAP.manual;
  return <Icon size={size} className={`shrink-0 ${cls} ${className}`} aria-hidden />;
}
