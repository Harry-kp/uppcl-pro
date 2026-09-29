"use client";

import { useSyncExternalStore } from "react";

/**
 * Single source of truth for the colour theme.
 * The resolved theme lives on <html class="dark|light"> (set before paint by
 * THEME_INIT_SCRIPT in layout.tsx). localStorage "theme" holds the user's
 * choice: "dark" | "light", or absent = follow the system.
 */
export type Theme = "dark" | "light";
export type ThemeChoice = Theme | "system";

const EVENT = "themechange";

/** Inlined in <head> so the first paint already has the right theme. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var c=document.documentElement.classList;c.toggle("dark",d);c.toggle("light",!d)}catch(e){}`;

function current(): Theme {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

export function getThemeChoice(): ThemeChoice {
  const t = localStorage.getItem("theme");
  return t === "dark" || t === "light" ? t : "system";
}

export function setTheme(choice: ThemeChoice): void {
  if (choice === "system") localStorage.removeItem("theme");
  else localStorage.setItem("theme", choice);
  const dark = choice === "dark" || (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("light", !dark);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** Resolved theme, kept in sync across every component that uses it. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, current, () => "dark" as Theme);
  return { theme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
