"use client";

import { useEffect, useRef } from "react";

// Module-level stack so stacked modals (e.g. symbol popup → trade modal)
// behave: Escape closes only the topmost, and the body scroll-lock is held
// until the LAST modal unmounts.
const modalStack: symbol[] = [];

export default function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const idRef = useRef<symbol | null>(null);
  if (idRef.current === null) idRef.current = Symbol("modal");

  useEffect(() => {
    const id = idRef.current as symbol;
    modalStack.push(id);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && modalStack[modalStack.length - 1] === id) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = modalStack.indexOf(id);
      if (i !== -1) modalStack.splice(i, 1);
      if (modalStack.length === 0) document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl border border-border bg-card shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header — stays visible while the body scrolls */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <h2 className="truncate text-base font-semibold sm:text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="-mr-1 shrink-0 rounded-md p-1 text-muted hover:bg-background hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-5">{children}</div>
      </div>
    </div>
  );
}
