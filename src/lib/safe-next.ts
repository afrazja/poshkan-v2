/**
 * Validate a post-login return URL.
 *
 * Only same-origin absolute paths are allowed. A value starting with "//" is
 * protocol-relative ("//evil.com") and would navigate off the site, so it is
 * rejected along with anything that is not rooted at "/" — otherwise the
 * ?next= parameter becomes an open redirect that phishing can point anywhere.
 */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}
