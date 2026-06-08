"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Avatar from "./Avatar";
import ThemeToggle from "./ThemeToggle";
import ChangePasswordModal from "./ChangePasswordModal";

export default function TopBar({ username, email }: { username: string; email: string }) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
    await createClient().auth.signOut();
    router.refresh();
    router.push("/");
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/80 px-4 py-3 backdrop-blur sm:px-6">
        {/* Left: site name */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            P
          </span>
          <span className="text-lg font-bold tracking-tight">Poshkan</span>
        </Link>

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
    </>
  );
}
