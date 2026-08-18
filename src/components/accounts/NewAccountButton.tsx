"use client";

/**
 * The page's primary action. Deliberately a filled, slightly raised gradient
 * button rather than Nocturne's usual outline — a one-off brand exception
 * called out in the handoff, not a P&L colour and not a mistake to "fix".
 */
export default function NewAccountButton({
  onClick,
  compact = false,
}: {
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        backgroundImage: "linear-gradient(180deg, #4f7fe8, #2f5bc4)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,.35), 0 1px 0 rgba(0,0,0,.2), 0 3px 6px rgba(20,30,80,.4)",
      }}
      className={`shrink-0 rounded-lg text-[12px] font-medium text-white transition hover:brightness-110 ${
        compact ? "px-[14px] py-[7px]" : "px-4 py-2"
      }`}
    >
      {compact ? "+ New" : "+ New account"}
    </button>
  );
}
