import "server-only";
import { createHmac } from "crypto";

// Signed unsubscribe token: proves the link came from an email we sent, so
// nobody can opt other people out by guessing user ids.
export function unsubSignature(userId: string): string {
  return createHmac("sha256", process.env.CRON_SECRET ?? "").update(userId).digest("hex").slice(0, 32);
}
