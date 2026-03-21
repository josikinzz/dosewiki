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
  const [theme, setTheme] = useState<ThemeName>(readInitialTheme);
  const isLight = theme === "light";

  useEffect(() => {
    applyThemeToDocument(theme);
    persistTheme(theme);
  }, [theme]);

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
      className="theme-toggle-pill group relative inline-flex h-11 w-20 items-center rounded-full px-1 shadow-[0_14px_30px_-24px_var(--theme-shadow-strong)] transition-[border-color,background-color] duration-300"
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-1 top-1 h-9 w-9 rounded-full border border-[color:var(--theme-border-subtle)] bg-[color:var(--theme-surface-muted)] shadow-[0_16px_28px_-22px_var(--theme-shadow-strong)] transition-transform duration-300 ${
          isLight ? "translate-x-9" : "translate-x-0"
        }`}
      />
      <span
        aria-hidden="true"
        className={`relative z-10 inline-flex h-9 w-9 items-center justify-center transition-colors duration-300 ${
          isLight ? "text-[color:var(--theme-text-faint)]" : "text-[color:var(--theme-accent-strong)]"
        }`}
      >
        <Moon size={16} />
      </span>
      <span
        aria-hidden="true"
        className={`relative z-10 inline-flex h-9 w-9 items-center justify-center transition-colors duration-300 ${
          isLight ? "text-[color:var(--theme-accent-strong)]" : "text-[color:var(--theme-text-faint)]"
        }`}
      >
        <Sun size={16} />
      </span>
    </button>
  );
}
