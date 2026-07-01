"use client";

import { useEffect } from "react";

// Warns on tab close / refresh / typing a new URL while there are unsaved
// edits. In-app client-side navigation (clicking a Link) isn't intercepted —
// Next.js App Router has no simple, universal hook for that — but this covers
// the dominant "lose my work" risk: leaving or reloading the page.
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = ""; // required for Chrome to show the native prompt
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

// Confirms discarding unsaved edits (e.g. before collapsing a dirty card).
// Returns true if it's OK to proceed.
export function confirmDiscardUnsaved(): boolean {
  return window.confirm("You have unsaved changes. Discard them and continue?");
}

// Small inline "unsaved changes" pill, shown next to a Save button.
export function UnsavedBadge() {
  return (
    <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Unsaved changes
    </span>
  );
}
