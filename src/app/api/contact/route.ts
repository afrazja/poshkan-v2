import { sendEmail } from "@/lib/email";

// The landing page's message box. One POST becomes one email to whoever runs
// Poshkan (CONTACT_EMAIL), with the visitor's address as reply-to when they
// left one. There is no table: the inbox is the record, and a failed send is
// logged in full so Vercel's runtime logs are the fallback inbox.

const MAX_MESSAGE = 2000;
const MAX_EMAIL = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Per-instance throttle. A serverless instance forgets it on cold start,
// which is fine: this is against a stuck finger or a dumb script, not an
// attack, and the honeypot below catches most of the scripts.
const WINDOW_MS = 10 * 60 * 1000;
const PER_WINDOW = 5;
const recent = new Map<string, number[]>();

function throttled(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  if (recent.size > 5000) recent.clear();
  recent.set(ip, hits);
  return hits.length > PER_WINDOW;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function reply(status: number, body: { ok: boolean; error?: string }) {
  return Response.json(body, { status });
}

export async function POST(req: Request) {
  let body: { message?: unknown; email?: unknown; website?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: "Bad request." });
  }

  // Honeypot: a field no person sees. Bots fill it; we say thanks and drop it.
  if (typeof body.website === "string" && body.website.trim()) return reply(200, { ok: true });

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!message) return reply(400, { ok: false, error: "Write something first." });
  if (message.length > MAX_MESSAGE) {
    return reply(400, { ok: false, error: `Keep it under ${MAX_MESSAGE} characters.` });
  }
  if (email && (email.length > MAX_EMAIL || !EMAIL_RE.test(email))) {
    return reply(400, { ok: false, error: "That email address doesn’t look right." });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (throttled(ip)) {
    return reply(429, { ok: false, error: "That’s a lot of messages. Try again in a few minutes." });
  }

  const to = process.env.CONTACT_EMAIL;
  if (!to) {
    console.error("[contact] CONTACT_EMAIL is not set; message dropped:", { email, message });
    return reply(503, { ok: false, error: "Messages aren’t set up yet. Sorry — try again later." });
  }

  const agent = (req.headers.get("user-agent") ?? "").slice(0, 160);
  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px">
    <p style="margin:0 0 12px;font-size:13px;color:#888">From the message box on poshkan.com</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#111;white-space:pre-wrap">${esc(message)}</p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#555">
      ${email ? `Reply to: <a href="mailto:${esc(email)}">${esc(email)}</a>` : "No address left, so no reply is possible."}<br/>
      ${esc(new Date().toUTCString())}${agent ? ` · ${esc(agent)}` : ""}
    </p>
  </div>`;

  const sent = await sendEmail(to, `Poshkan message from ${email || "a visitor"}`, html, email ? { replyTo: email } : {});
  if (!sent) {
    console.error("[contact] send failed; message:", { email, message });
    return reply(502, { ok: false, error: "Couldn’t send just now. Please try again in a minute." });
  }
  return reply(200, { ok: true });
}
