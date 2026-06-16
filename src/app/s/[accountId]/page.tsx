import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";

async function cardUrl(accountId: string): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "poshkan.com";
  const proto = host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}/api/share-card?account=${encodeURIComponent(accountId)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ accountId: string }>;
}): Promise<Metadata> {
  const { accountId } = await params;
  const img = await cardUrl(accountId);
  const title = "My paper-trading results — Poshkan";
  const description = "Practice stocks, crypto & forex with virtual money, an AI coach, and a leaderboard.";
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: img, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [img] },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const img = await cardUrl(accountId);
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt="Paper-trading results" className="w-full rounded-2xl border border-border shadow-lg" />
      <h1 className="text-2xl font-bold tracking-tight">Think you can do better?</h1>
      <p className="max-w-md text-sm text-muted">
        Poshkan is a free paper-trading simulator — practice stocks, crypto, and forex with 100%
        virtual money, get your trades reviewed by an AI coach, and climb the leaderboard.
      </p>
      <Link
        href="/"
        className="rounded-xl bg-primary px-8 py-3 text-base font-semibold text-primary-foreground shadow-md transition hover:opacity-90"
      >
        Start practicing free →
      </Link>
    </main>
  );
}
