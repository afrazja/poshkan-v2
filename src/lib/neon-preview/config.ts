// Local rehearsal and live data are explicitly separate modes.
export function productionEnabled() {
  return process.env.POSHKAN_DATABASE_MODE === 'neon';
}

export function previewEnabled() {
  return !productionEnabled() && process.env.POSHKAN_NEON_PREVIEW === "1" && !process.env.VERCEL;
}

export function requirePreview() {
  if (!previewEnabled() && !productionEnabled()) throw new Error("Neon is disabled");
}

export const previewOrigin = "http://localhost:3025";
export function appOrigin() { return productionEnabled() ? 'https://www.poshkan.com' : previewOrigin; }
export function passwordResetUrl() { return appOrigin() + (productionEnabled() ? '/auth/reset' : '/neon-preview/reset'); }
export function approvedUserId() { return productionEnabled() ? process.env.NEON_USER_ID : process.env.NEON_PREVIEW_USER_ID; }
export function databaseUrl() { return productionEnabled() ? process.env.NEON_DATABASE_URL : process.env.NEON_PREVIEW_DATABASE_URL; }
export function captureDeliveries() { return previewEnabled(); }

export function fullAppEnabled() {
  return productionEnabled() || (previewEnabled() && process.env.POSHKAN_NEON_FULL_APP === '1');
}
