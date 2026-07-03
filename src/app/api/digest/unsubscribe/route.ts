import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unsubSignature } from "@/lib/digest";

// One-click unsubscribe from the weekly digest. The link is HMAC-signed by
// the digest sender, so it works without a login (people open email on
// devices where they aren't signed in).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const userId = params.get("u");
  const sig = params.get("sig");
  if (!userId || !sig || sig !== unsubSignature(userId)) {
    return NextResponse.json({ error: "Invalid unsubscribe link" }, { status: 400 });
  }

  const db = createAdminClient();
  const { error } = await db
    .from("email_prefs")
    .upsert({ user_id: userId, weekly_digest: false }, { onConflict: "user_id" });
  if (error) {
    return NextResponse.json({ error: `Could not save preference (${error.message})` }, { status: 500 });
  }

  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
     <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#101014;color:#ececf1;display:grid;place-items:center;min-height:100vh;margin:0">
       <div style="text-align:center;padding:24px">
         <h1 style="font-size:18px">You're unsubscribed</h1>
         <p style="color:#8b8b96;font-size:14px">No more weekly digest emails. You can still see everything on your
         <a href="https://www.poshkan.com/dashboard" style="color:#6d5df6">dashboard</a>.</p>
       </div>
     </body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
