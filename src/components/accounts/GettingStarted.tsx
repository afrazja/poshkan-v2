"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import Link from "next/link";

export interface StartChecks {
  hasAccount: boolean;
  hasTrade: boolean;
}

interface Progress {
  researched: boolean;
  reviewed: boolean;
  dismissed: boolean;
}

const CHANGE_EVENT = "poshkan-getting-started-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readProgress(raw: string | null): Progress {
  try {
    const value = JSON.parse(raw || "{}");
    return {
      researched: value?.researched === true,
      reviewed: value?.reviewed === true,
      dismissed: value?.dismissed === true,
    };
  } catch {
    return { researched: false, reviewed: false, dismissed: false };
  }
}

// Account/trade steps come from the ledger. Research and reflection are
// explicitly self-confirmed, never inferred from clicking a link. Browser
// progress is versioned and user-scoped so shared devices do not mix checklists.
export default function GettingStarted({
  checks,
  userId,
  accountId,
}: {
  checks: StartChecks;
  userId: string;
  accountId: string;
}) {
  const storageKey = `poshkan-getting-started:v2:${userId}`;
  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  }, [storageKey]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  // Still usable when browser storage is blocked or full.
  const [fallback, setFallback] = useState<Progress | null>(null);
  const progress = fallback ?? readProgress(raw);

  function updateProgress(patch: Partial<Progress>) {
    const next = { ...progress, ...patch };
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setFallback(null);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      setFallback(next);
    }
  }

  const steps: {
    done: boolean;
    title: string;
    hint: React.ReactNode;
    manual?: "researched" | "reviewed";
    disabled?: boolean;
  }[] = [
    {
      done: checks.hasAccount,
      title: "Create a paper account",
      hint: <>Use <strong>+ New</strong> below to set up an account with virtual cash.</>,
    },
    {
      done: progress.researched,
      title: "Research a company",
      manual: "researched",
      hint: (
        <>
          Read <strong>Before you buy</strong>: what the company earns, its debt, and past price declines.{" "}
          <Link href="/symbol/AAPL" className="font-medium text-primary hover:underline">
            Read a company example →
          </Link>{" "}
          Check this step when you can explain what you learned.
        </>
      ),
    },
    {
      done: checks.hasTrade,
      title: "Make your first paper trade",
      hint: (
        <>
          Use your research to explain why you are taking a position, then practice with virtual cash.{" "}
          <Link href={`/dashboard/${accountId}`} className="font-medium text-primary hover:underline">
            Open your paper account →
          </Link>
        </>
      ),
    },
    {
      done: checks.hasTrade && progress.reviewed,
      title: "Review your first decision",
      manual: "reviewed",
      disabled: !checks.hasTrade,
      hint: (
        <>
          {checks.hasTrade ? (
            <>
              <Link href="/dashboard/history" className="font-medium text-primary hover:underline">
                Revisit a trade in History
              </Link>
              . Why did you choose it? What has changed? Would you make the same decision today?
              Check this step after reflecting on your answers.
            </>
          ) : (
            <>After your first paper trade, use History to reflect on why you chose it and what you learned.</>
          )}
        </>
      ),
    },
  ];

  const doneCount = steps.filter((step) => step.done).length;
  if ((raw === null && fallback === null) || progress.dismissed) return null;

  return (
    <section aria-labelledby="getting-started-title" className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="getting-started-title" className="text-sm font-semibold">
          Getting started <span className="ml-1 text-muted">{doneCount}/{steps.length}</span>
        </h2>
        <button onClick={() => updateProgress({ dismissed: true })} className="text-xs text-muted hover:text-foreground">
          Dismiss
        </button>
      </div>
      <p className="mb-4 text-xs text-muted">Research, practice, then reflect on your decision.</p>
      <div
        role="progressbar"
        aria-label="Getting started progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
        className="mb-4 h-1.5 overflow-hidden rounded-full bg-border"
      >
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="space-y-4">
        {steps.map((step, index) => (
          <li key={step.title} className="flex items-start gap-3 text-sm">
            {step.manual ? (
              <input
                type="checkbox"
                aria-label={step.title}
                aria-describedby={step.done ? undefined : `getting-started-hint-${index}`}
                checked={step.done}
                disabled={step.disabled}
                onChange={(event) => {
                  if (step.manual) updateProgress({ [step.manual]: event.target.checked });
                }}
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
              />
            ) : (
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${step.done ? "bg-positive text-white" : "border border-border text-muted"}`}>
                <span aria-hidden>{step.done ? "✓" : index + 1}</span>
                <span className="sr-only">{step.done ? "Completed" : "Not completed"}</span>
              </span>
            )}
            <div>
              <span className={step.done ? "text-muted line-through" : "font-medium"}>{step.title}</span>
              {!step.done && <p id={`getting-started-hint-${index}`} className="mt-1 text-xs leading-relaxed text-muted">{step.hint}</p>}
            </div>
          </li>
        ))}
      </ol>
      {doneCount === steps.length && (
        <p role="status" className="mt-4 text-sm text-positive">First steps complete. Keep researching and reviewing as you practice.</p>
      )}
      <p className="mt-4 text-xs text-muted">
        Stuck on a term? <Link href="/help" className="font-medium text-primary hover:underline">Read the quick guide →</Link>
      </p>
    </section>
  );
}
