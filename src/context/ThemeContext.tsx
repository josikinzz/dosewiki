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
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import {
  COLOR_SCHEME_STORAGE_KEY,
  THEME_META_ID,
  VISUAL_STYLE_STORAGE_KEY,
  getAppearanceMetaColor,
  isColorScheme,
  isVisualStyle,
  type Appearance,
  type ColorScheme,
  type VisualStyle,
} from "@/theme";

export type { Appearance, ColorScheme, VisualStyle } from "@/theme";
export { COLOR_SCHEME_STORAGE_KEY, THEME_META_ID, VISUAL_STYLE_STORAGE_KEY } from "@/theme";

/**
 * Two independent reader preferences, one owner. Every appearance control consumes this
 * context; nothing else may write `data-theme`, `data-visual-style`, `color-scheme` or the
 * `theme-color` meta value, because two writers cannot agree about what the reader chose.
 */
type ThemeContextValue = {
  colorScheme: ColorScheme;
  visualStyle: VisualStyle;
  setColorScheme: (value: ColorScheme) => void;
  setVisualStyle: (value: VisualStyle) => void;
  toggleColorScheme: () => void;
  toggleVisualStyle: () => void;
  /**
   * Whether this build pins the visual style. Part of the interface because it changes what
   * the setters do: under a lock `setVisualStyle` and `toggleVisualStyle` are no-ops and the
   * style storage key is never touched, so a control bound to them would do nothing. Hide
   * the Fun/Pro control on this rather than re-deriving the policy from the flavor config.
   */
  isVisualStyleLocked: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

type AppearanceGuard<T extends string> = (value: string | null | undefined) => value is T;

/**
 * What the pre-paint bootstrap already resolved for one axis.
 *
 * The document attribute is the first source, not the storage key: the bootstrap has already
 * validated storage and painted the result, so reading the document is how this provider ends
 * up agreeing with the frame the reader is looking at. Storage is consulted only for a
 * document carrying no valid attribute — a nested provider, or a bare test render.
 */
function resolvePaintedAxis<T extends string>(
  datasetKey: "theme" | "visualStyle",
  storageKey: string,
  isSupported: AppearanceGuard<T>,
): T | null {
  if (typeof document !== "undefined") {
    const painted = document.documentElement.dataset[datasetKey];

    if (isSupported(painted)) {
      return painted;
    }
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(storageKey);
    return isSupported(stored) ? stored : null;
  } catch {
    return null;
  }
}

function persistPreference(storageKey: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, value);
  } catch {
    // Ignore storage failures and keep the in-memory appearance active.
  }
}

function applyAppearanceToDocument({ colorScheme, visualStyle }: Appearance) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.dataset.theme = colorScheme;
  root.dataset.visualStyle = visualStyle;
  root.style.colorScheme = colorScheme;

  const meta =
    document.getElementById(THEME_META_ID) ??
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

  if (meta instanceof HTMLMetaElement) {
    meta.content = getAppearanceMetaColor({ colorScheme, visualStyle });
  }
}

export function ThemeProvider({
  children,
  initialColorScheme = SITE_FLAVOR_CONFIG.defaultColorScheme,
  initialVisualStyle = SITE_FLAVOR_CONFIG.defaultVisualStyle,
  isVisualStyleLocked = !SITE_FLAVOR_CONFIG.showVisualStyleToggle,
}: {
  children: ReactNode;
  /** What the server rendered, so the first client render matches the painted markup. */
  initialColorScheme?: ColorScheme;
  initialVisualStyle?: VisualStyle;
  /** Pins the style axis: setters become no-ops and the style key is never read or written. */
  isVisualStyleLocked?: boolean;
}) {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(initialColorScheme);
  const [visualStyle, setVisualStyleState] = useState<VisualStyle>(initialVisualStyle);
  /**
   * Until the mount effect has read back what the bootstrap resolved, this provider is still
   * holding the server's opening guess. Applying it would be harmless — the document already
   * says so — but *persisting* it would overwrite a saved preference with a default the reader
   * never chose, so both effects wait for this.
   */
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const paintedColorScheme = resolvePaintedAxis(
      "theme",
      COLOR_SCHEME_STORAGE_KEY,
      isColorScheme,
    );

    if (paintedColorScheme) {
      setColorScheme(paintedColorScheme);
    }

    // A locked style resolves from the build alone: neither the document nor the storage key
    // is consulted, so a dose.wiki reader's Fun/Pro choice cannot follow them into a
    // publication whose identity is one of those styles.
    if (!isVisualStyleLocked) {
      const paintedVisualStyle = resolvePaintedAxis(
        "visualStyle",
        VISUAL_STYLE_STORAGE_KEY,
        isVisualStyle,
      );

      if (paintedVisualStyle) {
        setVisualStyleState(paintedVisualStyle);
      }
    }

    setHydrated(true);
  }, [isVisualStyleLocked]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    applyAppearanceToDocument({ colorScheme, visualStyle });
    persistPreference(COLOR_SCHEME_STORAGE_KEY, colorScheme);

    if (!isVisualStyleLocked) {
      persistPreference(VISUAL_STYLE_STORAGE_KEY, visualStyle);
    }
  }, [hydrated, colorScheme, visualStyle, isVisualStyleLocked]);

  const setVisualStyle = useCallback(
    (value: VisualStyle) => {
      if (isVisualStyleLocked) {
        return;
      }

      setVisualStyleState(value);
    },
    [isVisualStyleLocked],
  );

  const toggleColorScheme = useCallback(() => {
    setColorScheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const toggleVisualStyle = useCallback(() => {
    if (isVisualStyleLocked) {
      return;
    }

    setVisualStyleState((current) => (current === "pro" ? "fun" : "pro"));
  }, [isVisualStyleLocked]);

  const value = useMemo(
    () => ({
      colorScheme,
      visualStyle,
      setColorScheme,
      setVisualStyle,
      toggleColorScheme,
      toggleVisualStyle,
      isVisualStyleLocked,
    }),
    [
      colorScheme,
      visualStyle,
      setVisualStyle,
      toggleColorScheme,
      toggleVisualStyle,
      isVisualStyleLocked,
    ],
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
