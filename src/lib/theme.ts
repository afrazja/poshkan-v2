"use client";

export type Theme = "light" | "dark";

const KEY = "poshkan-theme";

export function getTheme(): Theme {
  // Dark-first: dark is the brand default; light is an explicit opt-in.
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(KEY) as Theme | null;
  return stored ?? "dark";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  localStorage.setItem(KEY, theme);
}
