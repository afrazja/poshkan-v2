"use client";

import { useEffect, useState } from "react";
import { applyTheme, getTheme, type Theme } from "@/lib/theme";

// Theme toggle for the logged-out landing page (the in-app toggle lives behind
// auth). Persists to localStorage only — no profile write needed here.
export default function LandingThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => setTheme(getTheme()), []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle light or dark mode"
      className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/70 text-base backdrop-blur transition hover:bg-card"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
