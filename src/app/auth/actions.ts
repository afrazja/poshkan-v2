"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
