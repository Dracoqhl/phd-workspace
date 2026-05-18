"use client";

import { Monitor, Moon, Palette, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemePreference = "system" | "light" | "dark" | "forest" | "warm";

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

const THEME_STORAGE_KEY = "phd-workspace-theme";
const THEMES: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "forest", label: "Forest" },
  { value: "warm", label: "Warm" }
];

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) {
      setThemeState(stored);
      applyTheme(stored);
      return;
    }

    applyTheme("light");
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme(nextTheme) {
        setThemeState(nextTheme);
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        applyTheme(nextTheme);
      }
    }),
    [theme]
  );

  useEffect(() => {
    if (theme !== "system") return;

  const media = getDarkModeMedia();
  if (!media) return;
    const listener = () => applyTheme("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : theme === "system" ? Monitor : Palette;

  return (
    <label className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2 text-xs font-semibold text-muted shadow-sm">
      <Icon aria-hidden="true" className="h-3.5 w-3.5 text-accent" />
      <span className="sr-only">Theme</span>
      <select
        aria-label="Theme"
        className="h-7 cursor-pointer bg-transparent text-xs font-semibold text-primary outline-none"
        onChange={(event) => setTheme(event.target.value as ThemePreference)}
        value={theme}
      >
        {THEMES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("ThemeSelect must be used inside ThemeProvider");
  }

  return context;
}

function applyTheme(preference: ThemePreference) {
  const media = getDarkModeMedia();
  const resolved =
    preference === "system" && media?.matches ? "dark" : preference === "system" ? "light" : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
}

function getDarkModeMedia(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }

  return window.matchMedia("(prefers-color-scheme: dark)");
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark" || value === "forest" || value === "warm";
}
