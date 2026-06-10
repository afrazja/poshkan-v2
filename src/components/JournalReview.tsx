"use client";

import { useState } from "react";
import { reviewJournalAction } from "@/app/dashboard/[accountId]/actions";

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
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Claude is reviewing your trades…" : "🤖 AI review of my trading"}
      </button>
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
