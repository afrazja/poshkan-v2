import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { requirePreview } from "./config";

export function previewAuth() {
  requirePreview();
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret) throw new Error("Preview authentication is not configured");
  return createNeonAuth({
    baseUrl,
    cookies: { secret, sessionDataTtl: 1, sameSite: "lax" },
    logLevel: "silent",
  });
}
