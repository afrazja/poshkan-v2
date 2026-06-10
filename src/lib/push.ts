import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// Send a web-push notification to every device a user has subscribed.
// Best-effort: failures never throw; dead subscriptions are pruned.
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<number> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return 0;

  webpush.setVapidDetails("mailto:noreply@poshkan.app", publicKey, privateKey);

  const db = createAdminClient();
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs?.length) return 0;

  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.from("push_subscriptions").delete().eq("id", s.id); // expired device
        }
      }
    })
  );
  return sent;
}
