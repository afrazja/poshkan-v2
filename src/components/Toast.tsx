"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CircleCheck, CircleAlert, Info, X } from "lucide-react";

// Minimal in-house toast system — replaces browser alert() with styled,
// auto-dismissing notices. useToast() returns push(message, variant).
type Variant = "success" | "error" | "info";
interface ToastItem {
  id: number;
  variant: Variant;
  message: string;
}

const ToastCtx = createContext<(message: string, variant?: Variant) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

const STYLES: Record<Variant, { cls: string; Icon: typeof Info }> = {
  success: { cls: "border-positive/40 text-positive", Icon: CircleCheck },
  error: { cls: "border-negative/40 text-negative", Icon: CircleAlert },
  info: { cls: "border-primary/40 text-primary", Icon: Info },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, variant: Variant = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, variant, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      {/* Above the mobile bottom nav; bottom corner on desktop */}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:items-end">
        {toasts.map((t) => {
          const { cls, Icon } = STYLES[t.variant];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border bg-card px-4 py-3 text-sm shadow-lg animate-toast-in ${cls}`}
              role="status"
            >
              <Icon size={17} className="mt-0.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 text-foreground">{t.message}</span>
              <button
                onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
                aria-label="Dismiss"
                className="shrink-0 rounded p-0.5 text-muted hover:text-foreground"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
