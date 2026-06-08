"use client";

import { useEffect, useState } from "react";
import { applyTheme, getTheme, type Theme } from "@/lib/theme";
import { createClient } from "@/lib/supabase/client";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(getTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    // Persist to the profile (best-effort; UI doesn't block on it).
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) {
        createClient().from("profiles").update({ theme: next }).eq("id", data.user.id).then(() => {});
      }
    });
  }

  return (
    <button
      onClick={toggle}
      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-background"
    >
      <span>Appearance</span>
      <span className="flex items-center gap-2 text-muted">
        {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
      </span>
    </button>
  );
}
