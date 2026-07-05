"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

const GENERIC_LOGIN_ERROR = "Invalid email/username or password.";

// Sign in with an email OR a username. Username → email resolution happens
// server-side (service role) so a username never leaks the associated email.
export async function signInAction(
  identifier: string,
  password: string
): Promise<{ error?: string }> {
  const id = identifier.trim();
  if (!id || !password) return { error: "Enter your email/username and password." };

  let email = id;
  if (!id.includes("@")) {
    try {
      const admin = createAdminClient();
      const { data } = await admin.rpc("email_for_username", { p_username: id });
      email = (data as string | null) ?? "";
    } catch {
      email = ""; // migration not run, or lookup failed
    }
    if (!email) return { error: GENERIC_LOGIN_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: GENERIC_LOGIN_ERROR };
  return {};
}

// Whether a username is free (case-insensitive). Best-effort — the DB unique
// index is the real guard against races. Returns true if the check can't run.
export async function usernameAvailableAction(username: string): Promise<boolean> {
  const u = username.trim();
  if (!u) return false;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("username_available", { p_username: u });
    if (error) return true; // migration not run — don't block signup
    return data === true;
  } catch {
    return true;
  }
}

// Email the owner when someone signs up. Called fire-and-forget from the
// signup form; verified against auth.users (service role) so spamming the
// action can't generate mail — no freshly created user, no email. The
// recipient is the first ADMIN_EMAILS address.
export async function notifySignupAction(): Promise<void> {
  const admin = (process.env.ADMIN_EMAILS ?? "").split(",")[0]?.trim();
  if (!admin) return;
  try {
    const db = createAdminClient();
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const users = data?.users ?? [];
    const newest = [...users].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!newest || Date.now() - new Date(newest.created_at).getTime() > 5 * 60_000) return;
    await sendEmail(
      admin,
      `🎉 New Poshkan signup: ${newest.email ?? "unknown"}`,
      `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 8px">New signup</h2>
        <p style="font-size:15px;color:#333"><strong>${newest.email ?? "unknown"}</strong> just created an account.</p>
        <p style="font-size:13px;color:#666">Total users: <strong>${users.length}</strong></p>
        <a href="https://www.poshkan.com/admin" style="font-size:13px">Open the admin dashboard →</a>
      </div>`
    );
  } catch {
    // Never let the notification break a signup.
  }
}

// Send a password-reset email, resolving a username to its email first. Always
// returns success (no account enumeration); the UI shows a neutral message.
export async function resetPasswordAction(
  identifier: string,
  origin: string
): Promise<{ error?: string }> {
  const id = identifier.trim();
  if (!id) return { error: "Enter your email or username first." };

  let email = id;
  if (!id.includes("@")) {
    try {
      const admin = createAdminClient();
      const { data } = await admin.rpc("email_for_username", { p_username: id });
      email = (data as string | null) ?? "";
    } catch {
      email = "";
    }
    if (!email) return {}; // don't reveal whether the username exists
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/reset` });
  return {};
}
