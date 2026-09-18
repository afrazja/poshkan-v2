"use client";

export default function PreviewError({ reset }: { reset: () => void }) {
  return <div role="alert" className="space-y-5">
    <h1 className="text-2xl font-semibold">The test connection is unavailable</h1>
    <p>Please try again. Your live portfolios have not been changed.</p>
    <button className="rounded border px-4 py-2" onClick={reset}>Try again</button>
  </div>;
}
