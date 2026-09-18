import Link from "next/link";

export default function MissingPreviewAccount() {
  return <div className="space-y-5">
    <h1 className="text-2xl font-semibold">Portfolio unavailable</h1>
    <p>This portfolio does not exist or is not available to your signed-in account.</p>
    <Link className="text-teal-300 underline" href="/neon-preview/portfolio">Back to your portfolios</Link>
  </div>;
}
