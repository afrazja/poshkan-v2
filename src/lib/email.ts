import "server-only";

// Transactional email via Resend's REST API (RESEND_API_KEY).
// Note: with the shared onboarding@resend.dev sender, Resend only delivers to
// the email address that owns the Resend account until a domain is verified.
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Poshkan <onboarding@resend.dev>",
        to,
        subject,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function alertEmailHtml(input: {
  symbol: string;
  condition: "ABOVE" | "BELOW";
  targetPrice: number;
  triggeredPrice: number;
  appUrl: string;
}): string {
  const dir = input.condition === "ABOVE" ? "rose to" : "dropped to";
  return `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 4px">🔔 Price alert: ${input.symbol}</h2>
    <p style="font-size:16px;color:#333">
      <strong>${input.symbol}</strong> ${dir}
      <strong>$${input.triggeredPrice.toFixed(2)}</strong>
      (your target: $${input.targetPrice.toFixed(2)}).
    </p>
    <a href="${input.appUrl}/dashboard"
       style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">
      Open Poshkan
    </a>
    <p style="font-size:12px;color:#888;margin-top:24px">
      You set this alert in Poshkan. Dismiss it on your dashboard to stop tracking.<br/>
      Poshkan is a paper-trading simulator — all balances are virtual; nothing here is financial advice.
    </p>
  </div>`;
}
