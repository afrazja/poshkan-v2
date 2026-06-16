"use client";

import { useState } from "react";
import Modal from "@/components/Modal";

// Shows the shareable results card + share/copy/download actions.
export default function ShareCardModal({
  accountId,
  onClose,
}: {
  accountId: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = `${origin}/s/${accountId}`;
  const imgUrl = `${origin}/api/share-card?account=${accountId}`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    "My paper-trading results on Poshkan 📈 — think you can beat me?"
  )}&url=${encodeURIComponent(shareUrl)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — ignore
    }
  }

  const btn =
    "rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-background";

  return (
    <Modal title="Share your results" onClose={onClose} wide>
      <div className="space-y-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgUrl}
          alt="Your results card"
          className="w-full rounded-lg border border-border"
        />
        <div className="flex flex-wrap gap-2">
          <a
            href={tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Share on X
          </a>
          <button onClick={copy} className={btn}>
            {copied ? "✓ Copied" : "Copy link"}
          </button>
          <a href={imgUrl} download="poshkan-results.png" className={btn}>
            Download image
          </a>
        </div>
        <p className="text-xs text-muted">
          The link shows this card (your username + return) and a button for others to start
          practicing. Returns are already public on the leaderboard.
        </p>
      </div>
    </Modal>
  );
}
