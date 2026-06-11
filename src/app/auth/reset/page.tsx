"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type Stage = "verifying" | "form" | "invalid" | "done";

// Password-reset landing page. The email link may arrive with ?code= (PKCE),
// ?token_hash=&type=recovery, or an already-established session — handle all.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type");
    // Implicit-flow links and Supabase errors arrive in the #hash fragment.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const hashError = hash.get("error_description") ?? hash.get("error_code");

    if (hashError) {
      setStage("invalid");
      return;
    }

    let finished = false;
    const finish = (s: Stage) => {
      if (!finished) {
        finished = true;
        setStage(s);
      }
    };

    (async () => {
      try {
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (tokenHash && type === "recovery") {
          await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
        } else if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) return finish("form");
        // The client may still be processing a hash session — give it a moment.
        setTimeout(async () => {
          const {
            data: { user: retry },
          } = await supabase.auth.getUser();
          finish(retry ? "form" : "invalid");
        }, 1500);
      } catch {
        finish("invalid");
      }
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(error.message);
    setStage("done");
    setTimeout(() => {
      router.refresh();
      router.push("/dashboard");
    }, 1500);
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
        <div className="mb-6 flex items-center gap-2">
          <Image src="/icons/icon-192.png" alt="Poshkan" width={36} height={36} className="rounded-lg" />
          <span className="text-xl font-bold tracking-tight">Poshkan</span>
        </div>

        {stage === "verifying" && <p className="text-sm text-muted">Verifying your reset link…</p>}

        {stage === "invalid" && (
          <div className="space-y-3">
            <h1 className="text-lg font-semibold">Link invalid or expired</h1>
            <p className="text-sm text-muted">
              Password-reset links only work once and expire quickly. Request a new one from the
              login page.
            </p>
            <Link href="/" className="inline-block text-sm text-primary hover:underline">
              ← Back to login
            </Link>
          </div>
        )}

        {stage === "form" && (
          <form onSubmit={submit} className="space-y-4">
            <h1 className="text-lg font-semibold">Choose a new password</h1>
            {error && (
              <div className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
                {error}
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium">New password</label>
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Confirm new password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}

        {stage === "done" && (
          <p className="text-sm">✓ Password updated. Taking you to your dashboard…</p>
        )}
      </div>
    </main>
  );
}
