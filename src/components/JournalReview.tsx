"use client";

import { useState } from "react";
import { reviewJournalAction } from "@/app/dashboard/[accountId]/actions";

// Small inline spinner shown while the review runs.
function Spinner() {
  return (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
  );
}

// "AI review" button + rendered coach feedback.
export default function JournalReview() {
  const [review, setReview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setError(null);
    setLoading(true);
    const res = await reviewJournalAction();
    setLoading(false);
    if (res.error) return setError(res.error);
    setReview(res.review ?? null);
  }

  return (
    <div className="space-y-3">
      <button
        onClick={run}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-70"
      >
        {loading && <Spinner />}
        {loading ? "Claude is reviewing your trades…" : "🤖 AI review of my trading"}
      </button>
      {loading && (
        <p className="text-xs text-muted">
          This can take up to 30 seconds — Claude is reading your journal against the outcomes.
        </p>
      )}
      {error && (
        <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {error}
        </div>
      )}
      {review && (
        <div className="whitespace-pre-wrap rounded-2xl border border-primary/30 bg-primary/5 p-5 text-sm leading-relaxed">
          {review}
        </div>
      )}
    </div>
  );
}
