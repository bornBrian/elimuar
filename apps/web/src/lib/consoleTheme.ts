"use client";

export type ConsoleTheme = "light" | "dark";

const KEY = "elimuar.console.theme";

export function readConsoleTheme(): ConsoleTheme {
  if (typeof window === "undefined") return "light";
  try {
    return window.localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyConsoleTheme(theme: ConsoleTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.consoleTheme = theme;
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
  }
}
