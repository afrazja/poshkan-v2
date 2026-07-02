"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, Radar, History, Trophy } from "lucide-react";

const items = [
  {
    href: "/dashboard",
    label: "Accounts",
    Icon: Wallet,
    match: (p: string) =>
      p === "/dashboard" ||
      (p.startsWith("/dashboard/") &&
        !p.startsWith("/dashboard/scanners") &&
        !p.startsWith("/dashboard/leaderboard") &&
        !p.startsWith("/dashboard/history")),
  },
  {
    href: "/dashboard/scanners",
    label: "Scanners",
    Icon: Radar,
    match: (p: string) => p.startsWith("/dashboard/scanners"),
  },
  {
    href: "/dashboard/history",
    label: "History",
    Icon: History,
    match: (p: string) => p.startsWith("/dashboard/history"),
  },
  {
    href: "/dashboard/leaderboard",
    label: "Ranks",
    Icon: Trophy,
    match: (p: string) => p.startsWith("/dashboard/leaderboard"),
  },
];

// Mobile-only bottom navigation. Hidden on sm+ (the top bar handles desktop).
export default function BottomNav() {
  const path = usePathname() ?? "";
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((it) => {
        const active = it.match(path);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
              active ? "text-primary" : "text-muted hover:text-foreground"
            }`}
          >
            <it.Icon size={19} aria-hidden />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
