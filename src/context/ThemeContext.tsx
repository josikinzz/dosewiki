"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeName = "dark" | "light";

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
};

export const THEME_STORAGE_KEY = "dosewiki-theme";
export const THEME_META_ID = "theme-color-meta";

export const THEME_META_COLORS: Record<ThemeName, string> = {
  dark: "#0f0a1f",
  light: "#f6efff",
};

const DEFAULT_THEME: ThemeName = "dark";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeName(value: string | null | undefined): value is ThemeName {
  return value === "dark" || value === "light";
}

function readStoredTheme(): ThemeName | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeName(value) ? value : null;
  } catch {
    return null;
  }
}

export function persistTheme(theme: ThemeName) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures and keep the in-memory theme active.
  }
}

export function applyThemeToDocument(theme: ThemeName) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const meta =
    document.getElementById(THEME_META_ID) ??
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

  if (meta instanceof HTMLMetaElement) {
    meta.content = THEME_META_COLORS[theme];
  }
}

export function readInitialTheme(): ThemeName {
  if (typeof document !== "undefined") {
    const datasetTheme = document.documentElement.dataset.theme;
    if (isThemeName(datasetTheme)) {
      return datasetTheme;
    }
  }

  return readStoredTheme() ?? DEFAULT_THEME;
}

export function ThemeProvider({
  children,
  initialTheme = DEFAULT_THEME,
}: {
  children: ReactNode;
  initialTheme?: ThemeName;
}) {
  const [theme, setTheme] = useState<ThemeName>(initialTheme);

  useEffect(() => {
    const resolvedTheme = readInitialTheme();

    if (resolvedTheme !== initialTheme) {
      setTheme(resolvedTheme);
    }
  }, [initialTheme]);

  useEffect(() => {
    applyThemeToDocument(theme);

    persistTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
    }),
    [theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return value;
}
