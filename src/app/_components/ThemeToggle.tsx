"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
  applyThemeToDocument,
  persistTheme,
  readInitialTheme,
  type ThemeName,
} from "@/context/ThemeContext";

export function ThemeToggle() {
  // Always initialise with "dark" so server and client first-render match.
  // The real theme is synced from the DOM (set by the bootstrap script) in
  // the mount effect, avoiding a hydration mismatch.
  const [theme, setTheme] = useState<ThemeName>("dark");
  const [mounted, setMounted] = useState(false);
  const isLight = theme === "light";

  // After hydration, read the theme the bootstrap script already applied.
  useEffect(() => {
    setTheme(readInitialTheme());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      applyThemeToDocument(theme);
      persistTheme(theme);
    }
  }, [theme, mounted]);

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isLight}
      aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
      title={`Switch to ${isLight ? "dark" : "light"} mode`}
      className="theme-toggle-pill group relative inline-flex h-11 w-20 items-center rounded-full px-1 transition-[border-color,background-color] duration-300"
    >
      <span
        aria-hidden="true"
        className={`theme-toggle-thumb pointer-events-none absolute left-1 top-1 h-9 w-9 rounded-full border transition-transform duration-300 ${
          isLight ? "translate-x-9" : "translate-x-0"
        }`}
      />
      <span
        aria-hidden="true"
        className={`relative z-10 inline-flex h-9 w-9 items-center justify-center transition-colors duration-300 ${
          isLight ? "theme-toggle-icon-muted" : "theme-toggle-icon-accent"
        }`}
      >
        <Moon size={16} />
      </span>
      <span
        aria-hidden="true"
        className={`relative z-10 inline-flex h-9 w-9 items-center justify-center transition-colors duration-300 ${
          isLight ? "theme-toggle-icon-accent" : "theme-toggle-icon-muted"
        }`}
      >
        <Sun size={16} />
      </span>
    </button>
  );
}
