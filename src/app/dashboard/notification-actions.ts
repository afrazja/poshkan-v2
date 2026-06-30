"use server";

import { createClient } from "@/lib/supabase/server";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  url: string | null;
  read: boolean;
  created_at: string;
}

export async function getNotifications(): Promise<{ items: AppNotification[]; unread: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { items: [], unread: 0 };
  try {
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false),
    ]);
    return { items: (data as AppNotification[] | null) ?? [], unread: count ?? 0 };
  } catch {
    // notifications.sql not run yet — behave as empty.
    return { items: [], unread: 0 };
  }
}

export async function markNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  try {
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
  } catch {}
}
