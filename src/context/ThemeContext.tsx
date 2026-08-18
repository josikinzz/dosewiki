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
  ACCENT_STORAGE_KEY,
  SURFACE_STORAGE_KEY,
  BASE_SURFACE,
  COLOR_SCHEME_STORAGE_KEY,
  BASE_ACCENT,
  getInitialAppearance,
  LEGACY_ACCENT_TO_SURFACE,
  THEME_META_ID,
  VISUAL_STYLE_STORAGE_KEY,
  getAppearanceMetaColor,
  isAccent,
  isColorScheme,
  isSurface,
  isVisualStyle,
  type AccentId,
  type Appearance,
  type SurfaceId,
  type ColorScheme,
  type VisualStyle,
} from "@/theme";

export type { AccentId, Appearance, ColorScheme, SurfaceId, VisualStyle } from "@/theme";
export {
  ACCENT_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  THEME_META_ID,
  SURFACE_STORAGE_KEY,
  VISUAL_STYLE_STORAGE_KEY,
} from "@/theme";

/**
 * Three independent reader preferences, one owner. Every appearance control consumes this
 * context; nothing else may write `data-theme`, `data-visual-style`, `data-accent`,
 * `color-scheme` or the `theme-color` meta value, because two writers cannot agree about what
 * the reader chose.
 */
type ThemeContextValue = {
  colorScheme: ColorScheme;
  visualStyle: VisualStyle;
  accent: AccentId;
  surface: SurfaceId;
  setColorScheme: (value: ColorScheme) => void;
  setVisualStyle: (value: VisualStyle) => void;
  setAccent: (value: AccentId) => void;
  setSurface: (value: SurfaceId) => void;
  toggleColorScheme: () => void;
  toggleVisualStyle: () => void;
  /**
   * Whether this build pins the visual style. Part of the interface because it changes what
   * the setters do: under a lock `setVisualStyle` and `toggleVisualStyle` are no-ops and the
   * style storage key is never touched, so a control bound to them would do nothing. Hide
   * the Fun/Pro control on this rather than re-deriving the policy from the flavor config.
   */
  isVisualStyleLocked: boolean;
  /** Same contract for the accent axis: under a lock `setAccent` is a no-op. */
  isAccentLocked: boolean;
  isSurfaceLocked: boolean;
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
 *
 * The accent axis relies on that fallback rather than working around it. Its default writes
 * *no* attribute, so an absent `data-accent` is not a missing paint to be corrected: it is
 * the default accent, correctly painted. Falling through to storage then returns the reader's
 * saved id if they have one and null otherwise, and null leaves the default in place — which
 * is the same answer either way.
 */
function resolvePaintedAxis<T extends string>(
  datasetKey: "theme" | "visualStyle" | "surface" | "accent",
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

function applyAppearanceToDocument({ colorScheme, visualStyle, surface, accent }: Appearance) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.dataset.theme = colorScheme;
  root.dataset.visualStyle = visualStyle;
  root.style.colorScheme = colorScheme;
  if (surface === BASE_SURFACE) delete root.dataset.surface;
  else root.dataset.surface = surface;

  // The default accent is the *absence* of the attribute, matching the bootstrap: it has no
  // block in the generated stylesheet, so an attribute would name an override that does not
  // exist. Removal rather than assignment also covers the case the bootstrap never sees — a
  // reader switching back to the default from something else.
  if (accent === BASE_ACCENT) {
    delete root.dataset.accent;
  } else {
    root.dataset.accent = accent;
  }

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
  initialAccent,
  initialSurface,
  isVisualStyleLocked = !SITE_FLAVOR_CONFIG.showVisualStyleToggle,
  isAccentLocked = !SITE_FLAVOR_CONFIG.showAccentPicker,
  isSurfaceLocked = !SITE_FLAVOR_CONFIG.showSurfacePicker,
}: {
  children: ReactNode;
  /** What the server rendered, so the first client render matches the painted markup. */
  initialColorScheme?: ColorScheme;
  initialVisualStyle?: VisualStyle;
  initialAccent?: AccentId;
  initialSurface?: SurfaceId;
  /** Pins the style axis: setters become no-ops and the style key is never read or written. */
  isVisualStyleLocked?: boolean;
  /** Pins the accent axis, on the same terms. */
  isAccentLocked?: boolean;
  isSurfaceLocked?: boolean;
}) {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(initialColorScheme);
  const [visualStyle, setVisualStyleState] = useState<VisualStyle>(initialVisualStyle);
  const [surface, setSurfaceState] = useState<SurfaceId>(
    initialSurface ??
      (isSurfaceLocked ? BASE_SURFACE : getInitialAppearance(SITE_FLAVOR_CONFIG).surface),
  );
  /**
   * A lock outranks the publication's opening accent, the same rule `getInitialAppearance`
   * follows: a locked axis never adopts a painted value, so opening it anywhere but the base
   * would strand the provider on an accent the reader can never leave. Resolved here rather
   * than as a destructuring default because it reads `isAccentLocked`, declared below it.
   */
  const [accent, setAccentState] = useState<AccentId>(
    initialAccent ??
      (isAccentLocked ? BASE_ACCENT : getInitialAppearance(SITE_FLAVOR_CONFIG).accent),
  );
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

    if (!isSurfaceLocked) {
      const paintedSurface = resolvePaintedAxis("surface", SURFACE_STORAGE_KEY, isSurface);
      if (paintedSurface) {
        setSurfaceState(paintedSurface);
      } else {
        const legacyAccent = resolvePaintedAxis("accent", ACCENT_STORAGE_KEY, isAccent);
        if (legacyAccent) {
          setSurfaceState(LEGACY_ACCENT_TO_SURFACE[legacyAccent]);
        }
      }
    }
    if (!isAccentLocked) {
      const paintedAccent = resolvePaintedAxis("accent", ACCENT_STORAGE_KEY, isAccent);

      if (paintedAccent) {
        setAccentState(paintedAccent);
      }
    }

    setHydrated(true);
  }, [isVisualStyleLocked, isSurfaceLocked, isAccentLocked]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    applyAppearanceToDocument({ colorScheme, visualStyle, surface, accent });
    persistPreference(COLOR_SCHEME_STORAGE_KEY, colorScheme);

    if (!isVisualStyleLocked) {
      persistPreference(VISUAL_STYLE_STORAGE_KEY, visualStyle);
    }

    if (!isSurfaceLocked) {
      persistPreference(SURFACE_STORAGE_KEY, surface);
    }
    if (!isAccentLocked) {
      persistPreference(ACCENT_STORAGE_KEY, accent);
    }
  }, [hydrated, colorScheme, visualStyle, surface, accent, isVisualStyleLocked, isSurfaceLocked, isAccentLocked]);

  const setVisualStyle = useCallback(
    (value: VisualStyle) => {
      if (isVisualStyleLocked) {
        return;
      }

      setVisualStyleState(value);
    },
    [isVisualStyleLocked],
  );

  const setSurface = useCallback(
    (value: SurfaceId) => {
      if (!isSurfaceLocked) setSurfaceState(value);
    },
    [isSurfaceLocked],
  );

  const setAccent = useCallback(
    (value: AccentId) => {
      if (isAccentLocked) {
        return;
      }

      setAccentState(value);
    },
    [isAccentLocked],
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
      accent,
      surface,
      setColorScheme,
      setVisualStyle,
      setAccent,
      setSurface,
      toggleColorScheme,
      toggleVisualStyle,
      isVisualStyleLocked,
      isAccentLocked,
      isSurfaceLocked,
    }),
    [
      colorScheme,
      visualStyle,
      accent,
      surface,
      setVisualStyle,
      setAccent,
      setSurface,
      toggleColorScheme,
      toggleVisualStyle,
      isVisualStyleLocked,
      isSurfaceLocked,
      isAccentLocked,
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
