"use client";

import { useEffect } from "react";
import { applyTheme, type Theme } from "@/lib/theme";

// Applies the theme saved on the user's profile when they log in, so their
// preference follows their account across devices and domains (localStorage is
// per-origin, so without this a new device/domain falls back to the OS theme).
export default function ThemeSync({ theme }: { theme: string | null }) {
  useEffect(() => {
    if (theme === "light" || theme === "dark") {
      applyTheme(theme as Theme);
    }
  }, [theme]);
  return null;
}
