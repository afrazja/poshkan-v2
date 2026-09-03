"use client";

import type { ReactNode } from "react";
import type { Account } from "@/lib/types";

/**
 * The per-account `···` menu, shared by the table rows and both card tiers.
 * State and the handlers themselves live in AccountsGrid — this is only the
 * trigger and the popover.
 */
export default function AccountMenu({
  acc,
  open,
  onToggle,
  onRename,
  onMute,
  onLeaderboard,
  onReset,
  onDelete,
  tone = "muted",
}: {
  acc: Account;
  open: boolean;
  onToggle: () => void;
  onRename: () => void;
  onMute: () => void;
  onLeaderboard: () => void;
  onReset: () => void;
  onDelete: () => void;
  tone?: "muted" | "faint";
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
        aria-label={`Options for ${acc.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative z-20 rounded px-1.5 leading-none transition hover:text-[var(--n-text)] ${
          tone === "faint" ? "text-[var(--n-faint)]" : "text-[var(--n-mute)]"
        }`}
      >
        ···
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-lg border border-[var(--n-border-1)] bg-[var(--n-card-1)] py-1 shadow-lg">
          <Item onClick={onRename}>Rename</Item>
          <Item onClick={onMute}>
            {acc.notify_enabled === false ? "🔔 Unmute notifications" : "🔕 Mute notifications"}
          </Item>
          <Item onClick={onLeaderboard}>
            {acc.hidden_from_leaderboard ? "🏆 Show on leaderboard" : "🙈 Hide from leaderboard"}
          </Item>
          <Item onClick={onReset}>Reset</Item>
          <Item onClick={onDelete} danger>
            Delete
          </Item>
        </div>
      )}
    </div>
  );
}

function Item({
  children,
  onClick,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`block w-full px-3 py-2 text-left text-[12.5px] transition hover:bg-[var(--n-cell)] ${
        danger ? "text-[var(--n-loss)]" : "text-[var(--n-text-2)]"
      }`}
    >
      {children}
    </button>
  );
}
