// Keep credentials, response bodies, and session cookies out of diagnostics.
export function neonLoginFailure(error: unknown) {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const knownCodes = new Set([
    'INVALID_EMAIL_OR_PASSWORD', 'INVALID_PASSWORD', 'INVALID_EMAIL',
    'USER_NOT_FOUND', 'EMAIL_NOT_VERIFIED', 'INVALID_ORIGIN', 'MISSING_OR_NULL_ORIGIN',
    'TOO_MANY_REQUESTS', 'RATE_LIMITED', 'ACCOUNT_DISABLED', 'USER_BANNED',
    'AUTH_UPSTREAM_UNAVAILABLE', 'AUTH_UPSTREAM_TIMEOUT',
  ]);
  const code = typeof value.code === 'string' && knownCodes.has(value.code) ? value.code : 'UNKNOWN';
  const status = typeof value.status === 'number' && Number.isInteger(value.status) ? value.status : 0;
  let message = 'Neon sign-in is temporarily unavailable. Please try again.';
  if (['INVALID_EMAIL_OR_PASSWORD', 'INVALID_PASSWORD', 'INVALID_EMAIL', 'USER_NOT_FOUND'].includes(code)) {
    message = 'This email and password were not accepted. Use your new Poshkan password, or request a password-reset link.';
  } else if (status === 429 || ['TOO_MANY_REQUESTS', 'RATE_LIMITED'].includes(code)) {
    message = 'Too many sign-in attempts. Please wait a few minutes and try again.';
  } else if (code === 'EMAIL_NOT_VERIFIED') {
    message = 'Please verify your email using the Neon verification email before signing in.';
  } else if (['INVALID_ORIGIN', 'MISSING_OR_NULL_ORIGIN'].includes(code)) {
    message = 'Neon is blocking this app address. The sign-in connection needs to be corrected.';
  }
  return { message, diagnostic: { code, status } };
}
