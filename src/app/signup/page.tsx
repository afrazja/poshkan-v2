import Image from "next/image";
import Link from "next/link";
import AuthCard from "@/components/auth/AuthCard";
import RecoveryRedirect from "@/components/auth/RecoveryRedirect";
import SiteFooter from "@/components/SiteFooter";

export const metadata = {
  title: "Create your account — Poshkan",
  description:
    "Sign up for Poshkan — free paper trading across US stocks, crypto and forex. An email and a password is the whole sign-up.",
  robots: { index: false },
};

// The sign-up / log-in page. The landing page's CTAs and email field land
// here; the expired-session flow lands here too (on the Log in tab).
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; expired?: string; tab?: string }>;
}) {
  const { email, expired, tab } = await searchParams;
  const defaultTab = expired || tab === "login" ? "login" : "signup";

  return (
    <div className="flex min-h-screen flex-col">
      <RecoveryRedirect />
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/icons/icon-192.png" alt="" width={32} height={32} className="rounded-lg" />
          <span className="text-xl font-bold tracking-tight">Poshkan</span>
        </Link>
        {expired && (
          <div className="w-full max-w-md rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
            Your session expired — please log in again.
          </div>
        )}
        <AuthCard defaultTab={defaultTab} initialEmail={email ?? ""} />
        <p className="max-w-md text-center text-xs text-muted">
          Free while Poshkan is in beta. No card, no broker connection, no deposits.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
