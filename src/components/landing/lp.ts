import type { CSSProperties } from "react";

// Shared style constants for the landing page (Nocturne design handoff).
// The accent is a single token — change --lp-accent in src/app/page.tsx to
// retheme every button, kicker, link and glow at once.

export const BTN_BASE =
  "inline-flex items-center justify-center rounded-lg border transition " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]";

// Outlined, never filled: 1px accent border, accent text; hover fills 12%, active 22%.
export const BTN_PRIMARY =
  `${BTN_BASE} border-[var(--lp-accent)] text-[var(--lp-accent)] ` +
  "hover:bg-[color-mix(in_srgb,var(--lp-accent)_12%,transparent)] active:bg-[color-mix(in_srgb,var(--lp-accent)_22%,transparent)]";

export const BTN_SECONDARY =
  `${BTN_BASE} border-[var(--lp-divider)] text-[#e9e9ed] ` +
  "hover:bg-[color-mix(in_srgb,#e9e9ed_7%,transparent)] active:bg-[color-mix(in_srgb,#e9e9ed_12%,transparent)]";

export const INPUT_LP =
  "rounded-lg border border-[var(--lp-divider)] bg-transparent px-4 text-[15px] text-[#e9e9ed] " +
  "placeholder:text-[#e9e9ed73] outline-none " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]";

// Every horizontal rule fades to transparent over 48px at each end.
export const FADE_RULE: CSSProperties = {
  height: 1,
  background:
    "linear-gradient(to right, transparent, var(--lp-divider) 48px, var(--lp-divider) calc(100% - 48px), transparent)",
};

// Media frames: 1px edge + ambient darkness (Nocturne --shadow-md).
export const SHADOW_MD = "0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,0.55)";
export const SHADOW_SM = "0 0 0 1px #3f424d";
