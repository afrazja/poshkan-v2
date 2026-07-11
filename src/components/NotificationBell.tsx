"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  getNotifications,
  markNotificationsRead,
  type AppNotification,
} from "@/app/dashboard/notification-actions";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await getNotifications();
    setItems(res.items);
    setUnread(res.unread);
  }

  // Initial load + light polling so the badge stays current (hidden tabs skip).
  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      await markNotificationsRead();
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-lg hover:bg-background"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-negative px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 max-h-[28rem] w-80 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-lg">
          <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Notifications
          </div>
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted">No notifications yet.</p>
          ) : (
            <div className="space-y-0.5">
              {items.map((n) => {
                const body = (
                  <div className={`rounded-lg px-2 py-2 ${n.read ? "" : "bg-primary/5"}`}>
                    <div className="flex items-start gap-1.5">
                      {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                      <div className="min-w-0">
                        <div className="text-sm font-medium leading-snug">{n.title}</div>
                        <div className="mt-0.5 text-xs leading-snug text-muted">{n.body}</div>
                        <div className="mt-0.5 text-[10px] text-muted">{ago(n.created_at)}</div>
                      </div>
                    </div>
                  </div>
                );
                return n.url ? (
                  <Link
                    key={n.id}
                    href={n.url}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg hover:bg-background"
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={n.id}>{body}</div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
