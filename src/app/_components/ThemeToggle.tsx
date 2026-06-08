"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
  applyThemeToDocument,
  persistTheme,
  readInitialTheme,
  type ThemeName,
} from "@/context/ThemeContext";

const LIGHT_FROSTED_TOGGLE_CLASSES =
  "[html[data-theme='light']_&]:border-transparent [html[data-theme='light']_&]:[background:var(--theme-light-frosted-control-bg)] [html[data-theme='light']_&]:[box-shadow:var(--theme-light-frosted-control-shadow)] [html[data-theme='light']_&:hover]:[background:var(--theme-light-frosted-control-hover-bg)] [html[data-theme='light']_&:hover]:[box-shadow:var(--theme-light-frosted-control-hover-shadow)]";
const LIGHT_FROSTED_THUMB_CLASSES =
  "[html[data-theme='light']_&]:border-[color:var(--theme-light-frosted-panel-border)] [html[data-theme='light']_&]:[background:var(--theme-light-frosted-panel-bg)] [html[data-theme='light']_&]:[box-shadow:var(--theme-light-frosted-panel-shadow)]";

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
      className={`theme-toggle-pill group relative inline-flex h-11 w-20 items-center rounded-full px-1 shadow-[0_14px_30px_-24px_var(--theme-shadow-strong)] transition-[border-color,background-color] duration-300 ${LIGHT_FROSTED_TOGGLE_CLASSES}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-1 top-1 h-9 w-9 rounded-full border border-[color:var(--theme-border-subtle)] bg-[color:var(--theme-surface-muted)] shadow-[0_16px_28px_-22px_var(--theme-shadow-strong)] transition-transform duration-300 ${LIGHT_FROSTED_THUMB_CLASSES} ${
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
