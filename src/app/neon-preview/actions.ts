"use server";

import { redirect } from "next/navigation";
import { previewAuth } from "@/lib/neon-preview/auth";
import { previewOrigin } from "@/lib/neon-preview/config";

export type FormState = { error?: string; message?: string };

export async function signIn(_state: FormState, data: FormData): Promise<FormState> {
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");
  if (!email || !password) return { error: "Enter your email and app login password." };
  try {
    const { error } = await previewAuth().signIn.email({ email, password });
    if (error) return { error: "Sign-in failed. Check your email and password, or use Set up / reset password." };
  } catch {
    return { error: "Could not reach Neon sign-in. Please try again." };
  }
  redirect("/neon-preview/portfolio");
}

export async function requestReset(_state: FormState, data: FormData): Promise<FormState> {
  const email = String(data.get("email") || "").trim();
  if (!email || email.length > 254) return { error: "Enter your email address." };
  try {
    const { error } = await previewAuth().requestPasswordReset({
      email, redirectTo: `${previewOrigin}/neon-preview/reset`,
    });
    if (error) return { error: "Neon could not send the reset link. Check that email authentication is enabled in Neon Auth settings, then try again." };
    return { message: "If this email has a Neon account, a reset link has been sent. Open it on this computer while this preview is running." };
  } catch {
    return { error: "Could not reach Neon password recovery. Please try again." };
  }
}

export async function resetPassword(_state: FormState, data: FormData): Promise<FormState> {
  const token = String(data.get("token") || "");
  const newPassword = String(data.get("password") || "");
  if (!token) return { error: "Open the link in your password-reset email first." };
  if (newPassword !== data.get("confirm")) return { error: "The passwords do not match." };
  if (newPassword.length < 8) return { error: "Use at least 8 characters for your Neon login password." };
  try {
    const { error } = await previewAuth().resetPassword({ token, newPassword });
    if (error) return { error: "The password could not be saved. The link may have expired; request a new reset link." };
  } catch {
    return { error: "Could not reach Neon. Please try again." };
  }
  redirect("/neon-preview?password=saved");
}

export async function signOut() {
  await previewAuth().signOut();
  redirect("/neon-preview");
}
