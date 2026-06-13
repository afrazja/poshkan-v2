"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signInAction, usernameAvailableAction, resetPasswordAction } from "@/app/auth/actions";

type Tab = "login" | "signup";

// Small inline spinner for buttons in their loading state.
function Spinner() {
  return (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
  );
}

export default function AuthCard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");

  // shared
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // signup-only
  const [username, setUsername] = useState("");
  const [confirm, setConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  function reset() {
    setError(null);
    setSent(false);
    setForgotSent(false);
  }

  async function handleForgot() {
    reset();
    if (!email.trim()) {
      setError("Enter your email or username above first, then click 'Forgot your password?'.");
      return;
    }
    setLoading(true);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const res = await resetPasswordAction(email, siteUrl);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setForgotSent(true);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    reset();
    setLoading(true);
    const res = await signInAction(email, password);
    if (res.error) {
      setLoading(false);
      setError(res.error);
      return;
    }
    // Keep the button in its loading state through the navigation — the dashboard
    // takes a moment to load, and this component unmounts once it arrives.
    router.refresh();
    router.push("/dashboard");
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    reset();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (username.trim().length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setError("Username can only contain letters, numbers, and underscores.");
      return;
    }
    setLoading(true);
    // Friendly pre-check; the DB unique index is the real guard against races.
    const available = await usernameAvailableAction(username);
    if (!available) {
      setLoading(false);
      setError("That username is taken — try another.");
      return;
    }
    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: username.trim() },
        emailRedirectTo: `${siteUrl}/auth/confirm`,
      },
    });
    setLoading(false);
    if (error) {
      // A race past the pre-check trips the unique index — surface it kindly.
      const taken = /duplicate|unique|already|profiles_username/i.test(error.message);
      setError(taken ? "That username is taken — try another." : error.message);
      return;
    }
    setSent(true);
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  if (sent) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-4 text-4xl">📬</div>
        <h2 className="mb-2 text-xl font-semibold">Check your inbox</h2>
        <p className="text-sm text-muted">
          We sent a confirmation link to <strong>{email}</strong>. Click it to
          activate your Poshkan account, then come back and log in.
        </p>
        <button
          onClick={() => {
            setTab("login");
            setSent(false);
          }}
          className="mt-6 text-sm font-medium text-primary hover:underline"
        >
          ← Back to log in
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div className="mb-6 flex rounded-lg bg-background p-1">
        <button
          onClick={() => {
            setTab("login");
            reset();
          }}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
            tab === "login" ? "bg-card shadow-sm" : "text-muted"
          }`}
        >
          Log in
        </button>
        <button
          onClick={() => {
            setTab("signup");
            reset();
          }}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
            tab === "signup" ? "bg-card shadow-sm" : "text-muted"
          }`}
        >
          Create account
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {error}
        </div>
      )}

      {tab === "login" ? (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Email or username</label>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@example.com or yourname"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-70"
          >
            {loading && <Spinner />}
            {loading ? "Signing in…" : "Log in"}
          </button>
          <button
            type="button"
            onClick={handleForgot}
            disabled={loading}
            className="w-full text-center text-xs text-muted hover:text-foreground hover:underline"
          >
            Forgot your password?
          </button>
          {forgotSent && (
            <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
              If an account exists for <strong>{email}</strong>, a password-reset link is on its
              way. Check your inbox.
            </p>
          )}
        </form>
      ) : (
        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              placeholder="trader_jane"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="At least 6 characters"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Confirm password</label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-70"
          >
            {loading && <Spinner />}
            {loading ? "Creating…" : "Create account"}
          </button>
          <p className="text-center text-xs text-muted">
            Poshkan is a 100% virtual paper-trading simulator — no real money, no financial
            advice. By creating an account you agree to the{" "}
            <a href="/terms" className="underline hover:text-foreground">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline hover:text-foreground">
              Privacy policy
            </a>
            .
          </p>
        </form>
      )}
    </div>
  );
}
