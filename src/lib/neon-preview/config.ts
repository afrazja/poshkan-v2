// This opt-in preview is deliberately unavailable on deployed environments.
export function previewEnabled() {
  return process.env.POSHKAN_NEON_PREVIEW === "1" && !process.env.VERCEL;
}

export function requirePreview() {
  if (!previewEnabled()) throw new Error("Neon preview is disabled");
}

export const previewOrigin = "http://localhost:3025";

export function fullAppEnabled() {
  return previewEnabled() && process.env.POSHKAN_NEON_FULL_APP === '1';
}
