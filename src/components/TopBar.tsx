"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Avatar from "./Avatar";
import ThemeToggle from "./ThemeToggle";
import ChangePasswordModal from "./ChangePasswordModal";
import ApiAccessModal from "./ApiAccessModal";
import AnthropicKeyModal from "./AnthropicKeyModal";
import { savePushSubscriptionAction, sendTestNotificationAction } from "@/app/dashboard/[accountId]/actions";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function TopBar({ username, email }: { username: string; email: string }) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showApiAccess, setShowApiAccess] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  async function enablePush() {
    setPushMsg(null);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return setPushMsg("Not supported in this browser");
      }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) return setPushMsg("Push not configured (VAPID key missing)");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setPushMsg("Permission denied");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
      const json = sub.toJSON();
      const res = await savePushSubscriptionAction({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      });
      setPushMsg(res.error ?? "✓ Notifications enabled on this device");
    } catch (e) {
      setPushMsg(`Failed: ${(e as Error).message}`);
    }
  }

  async function testPush() {
    setPushMsg("Sending test…");
    const res = await sendTestNotificationAction();
    setPushMsg(res.error ?? `✓ Test sent to ${res.sent} device(s) — check your phone`);
  }
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setSettingsOpen(false);
        setAvatarOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function signOut() {
    // Flag so SessionWatcher doesn't treat this as an expired session.
    try {
      sessionStorage.setItem("poshkan-signing-out", "1");
    } catch {}
    await createClient().auth.signOut();
    router.refresh();
    router.push("/");
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/80 px-4 py-3 backdrop-blur sm:px-6">
        {/* Left: site name + nav */}
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image src="/icons/icon-192.png" alt="Poshkan" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-bold tracking-tight">Poshkan</span>
          </Link>
          <Link
            href="/dashboard/leaderboard"
            className="rounded-lg px-2 py-1 text-sm font-medium text-muted transition hover:bg-background hover:text-foreground"
          >
            🏆 Leaderboard
          </Link>
          <Link
            href="/dashboard/journal"
            className="rounded-lg px-2 py-1 text-sm font-medium text-muted transition hover:bg-background hover:text-foreground"
          >
            📓 Journal
          </Link>
        </div>

        {/* Right: settings (left of avatar) + avatar */}
        <div ref={ref} className="flex items-center gap-2">
          {/* Settings */}
          <div className="relative">
            <button
              onClick={() => {
                setSettingsOpen((v) => !v);
                setAvatarOpen(false);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-lg hover:bg-background"
              aria-label="Settings"
            >
              ⚙️
            </button>
            {settingsOpen && (
              <div className="absolute right-0 mt-2 w-60 rounded-xl border border-border bg-card p-2 shadow-lg">
                <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  Settings
                </div>
                <ThemeToggle />
                <button
                  onClick={() => {
                    setShowPassword(true);
                    setSettingsOpen(false);
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-background"
                >
                  Change password
                </button>
                <button
                  onClick={() => {
                    setShowApiAccess(true);
                    setSettingsOpen(false);
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-background"
                >
                  Claude API access
                </button>
                <button
                  onClick={() => {
                    setShowAnthropicKey(true);
                    setSettingsOpen(false);
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-background"
                >
                  Your Claude API key (for AI)
                </button>
                <button
                  onClick={enablePush}
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-background"
                >
                  Enable notifications
                </button>
                <button
                  onClick={testPush}
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-background"
                >
                  Send test notification
                </button>
                <Link
                  href="/help"
                  onClick={() => setSettingsOpen(false)}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-background"
                >
                  Help &amp; guide
                </Link>
                {pushMsg && <p className="px-3 py-1 text-xs text-muted">{pushMsg}</p>}
              </div>
            )}
          </div>

          {/* Avatar */}
          <div className="relative">
            <button
              onClick={() => {
                setAvatarOpen((v) => !v);
                setSettingsOpen(false);
              }}
              aria-label="Account menu"
            >
              <Avatar name={username} />
            </button>
            {avatarOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-card p-2 shadow-lg">
                <div className="px-3 py-2">
                  <div className="text-sm font-semibold">{username}</div>
                  <div className="truncate text-xs text-muted">{email}</div>
                </div>
                <div className="my-1 border-t border-border" />
                <button
                  onClick={signOut}
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-negative hover:bg-background"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}
      {showApiAccess && <ApiAccessModal onClose={() => setShowApiAccess(false)} />}
      {showAnthropicKey && <AnthropicKeyModal onClose={() => setShowAnthropicKey(false)} />}
    </>
  );
}
