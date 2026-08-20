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
  applyChromaToDocument,
  DEFAULT_ACCENT_HUE,
  DEFAULT_ACCENT_LEVEL,
  DEFAULT_SURFACE_HUE,
  DEFAULT_SURFACE_LEVEL,
  parseChromaLevel,
  parseHueDegrees,
} from "@/theme/appearanceChroma";
import { LEGACY_ACCENT_TO_HUE } from "@/theme/accents";
import { LEGACY_SURFACE_TO_HUE } from "@/theme/surfaces";
import {
  ACCENT_CHROMA_STORAGE_KEY,
  ACCENT_HUE_STORAGE_KEY,
  ACCENT_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  SURFACE_CHROMA_STORAGE_KEY,
  SURFACE_HUE_STORAGE_KEY,
  SURFACE_STORAGE_KEY,
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
export {
  ACCENT_CHROMA_STORAGE_KEY,
  ACCENT_HUE_STORAGE_KEY,
  // The retired colourway keys: still exported because the migration below is
  // observable — tests and the bootstrap name them — not because anything may
  // write them again.
  ACCENT_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  THEME_META_ID,
  SURFACE_CHROMA_STORAGE_KEY,
  SURFACE_HUE_STORAGE_KEY,
  SURFACE_STORAGE_KEY,
  VISUAL_STYLE_STORAGE_KEY,
} from "@/theme";

/**
 * The reader's appearance preferences, one owner. Every appearance control consumes this
 * context; nothing else may write `data-theme`, `data-visual-style`, `color-scheme`, the
 * `--dw-*` appearance properties or the `theme-color` meta value, because two writers
 * cannot agree about what the reader chose.
 */
type ThemeContextValue = {
  colorScheme: ColorScheme;
  visualStyle: VisualStyle;
  setColorScheme: (value: ColorScheme) => void;
  setVisualStyle: (value: VisualStyle) => void;
  /**
   * The effective saturation levels — always a decimal in 0..1: the reader's
   * saved level, or the site default (`DEFAULT_SURFACE_LEVEL` /
   * `DEFAULT_ACCENT_LEVEL`) while they have never moved that slider. The
   * setters take null to mean "back to the default level": the storage key is
   * removed — a default is never written — and the exposed level returns to
   * the default. Each level rides its parent axis's lock.
   */
  surfaceChroma: number;
  accentChroma: number;
  setSurfaceChroma: (value: number | null) => void;
  setAccentChroma: (value: number | null) => void;
  /**
   * The hue axes: the reader's saved rotation in integer degrees 0..359, or
   * null while they never moved that slider — null IS the site default
   * (`DEFAULT_SURFACE_HUE` / `DEFAULT_ACCENT_HUE`), exposed as null so a
   * consumer can tell "chose 0" from "never chose". The setters take null on
   * the chroma setters' terms: key removed, back to the default.
   */
  surfaceHue: number | null;
  accentHue: number | null;
  setSurfaceHue: (value: number | null) => void;
  setAccentHue: (value: number | null) => void;
  toggleColorScheme: () => void;
  toggleVisualStyle: () => void;
  /**
   * Whether this build pins the visual style. Part of the interface because it changes what
   * the setters do: under a lock `setVisualStyle` and `toggleVisualStyle` are no-ops and the
   * style storage key is never touched, so a control bound to them would do nothing. Hide
   * the Fun/Pro control on this rather than re-deriving the policy from the flavor config.
   */
  isVisualStyleLocked: boolean;
  /** Same contract for the accent axes: under a lock the hue and chroma setters are no-ops. */
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

/**
 * A saved axis number — a chroma level's decimal or a hue's integer degrees —
 * persists as its string, and null removes the key: a missing key is what "the
 * site default" means to the pre-paint bootstrap, so removal — not writing the
 * default's current value — is what keeps a reader on the default as it
 * evolves.
 */
function persistAxisNumber(storageKey: string, value: number | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, String(value));
  } catch {
    // Ignore storage failures and keep the in-memory value active.
  }
}

/**
 * The reader's saved level or hue, or null when they never saved one. Storage,
 * not the painted custom property: the bootstrap paints stored ?? default, so
 * the property alone cannot say whether the reader chose the value it carries —
 * and adopting a painted default as "saved" would persist it, freezing the
 * reader on a default they never picked.
 */
function resolveStoredChroma(storageKey: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    return parseChromaLevel(window.localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function resolveStoredHue(storageKey: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    return parseHueDegrees(window.localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

/**
 * One retired colourway id and its (hue, chroma) coordinates, or null. Raw
 * string in: the legacy keys hold ids from the discrete-swatch era, and an
 * unknown or retired id maps to nothing rather than to a guess.
 */
function resolveLegacyColourway<K extends string>(
  map: Readonly<Record<K, { readonly hue: number; readonly chroma?: 0 }>>,
  storageKey: string,
): { readonly hue: number; readonly chroma?: 0 } | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return null;
    // `hasOwnProperty` rather than `Object.hasOwn`, which this project's `lib`
    // target does not carry.
    return Object.prototype.hasOwnProperty.call(map, stored) ? map[stored as K] : null;
  } catch {
    return null;
  }
}

function removeStoredKey(storageKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // A key that cannot be removed is a key that also could not be read later.
  }
}

/** Integer degrees on the hue circle; the slider's own domain. */
function clampHueDegrees(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 359);
}

function applyAppearanceToDocument({
  colorScheme,
  visualStyle,
}: Pick<Appearance, "colorScheme" | "visualStyle">) {
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
  isAccentLocked = !SITE_FLAVOR_CONFIG.showAccentPicker,
  isSurfaceLocked = !SITE_FLAVOR_CONFIG.showSurfacePicker,
}: {
  children: ReactNode;
  /** What the server rendered, so the first client render matches the painted markup. */
  initialColorScheme?: ColorScheme;
  initialVisualStyle?: VisualStyle;
  /** Pins the style axis: setters become no-ops and the style key is never read or written. */
  isVisualStyleLocked?: boolean;
  /** Pins the accent hue and saturation axes, on the same terms. */
  isAccentLocked?: boolean;
  isSurfaceLocked?: boolean;
}) {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(initialColorScheme);
  const [visualStyle, setVisualStyleState] = useState<VisualStyle>(initialVisualStyle);
  /**
   * The reader's *saved* level and hue per axis, or null while they never
   * saved one. Null is the persistence state, not the display one: the exposed
   * level resolves `?? DEFAULT_*`, and the persist effect removes the key on
   * null so a default is never written into storage. The hue is exposed as the
   * null itself — its consumers resolve the default — but persists on exactly
   * the same terms.
   */
  const [savedSurfaceChroma, setSurfaceChromaState] = useState<number | null>(null);
  const [savedAccentChroma, setAccentChromaState] = useState<number | null>(null);
  const [savedSurfaceHue, setSurfaceHueState] = useState<number | null>(null);
  const [savedAccentHue, setAccentHueState] = useState<number | null>(null);
  const surfaceChroma = savedSurfaceChroma ?? DEFAULT_SURFACE_LEVEL;
  const accentChroma = savedAccentChroma ?? DEFAULT_ACCENT_LEVEL;
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

    /**
     * Hue and chroma per colour axis, plus the one-time migration off the
     * discrete-swatch era. A reader who last chose a colourway id has it in the
     * legacy key and no hue key: the id's (hue, chroma) coordinates become
     * their saved values — the achromatic ids also pin chroma to 0, overriding
     * any stored level, because grey was the whole point of that pick. The
     * legacy key is then removed either way: with the hue key present or the id
     * translated, it answers nothing anymore. A locked axis touches none of its
     * keys, so an Effect Index visit cannot eat a dose.wiki reader's migration.
     */
    if (!isSurfaceLocked) {
      const storedHue = resolveStoredHue(SURFACE_HUE_STORAGE_KEY);
      let hue = storedHue;
      let chroma = resolveStoredChroma(SURFACE_CHROMA_STORAGE_KEY);
      if (storedHue === null) {
        const legacy = resolveLegacyColourway(LEGACY_SURFACE_TO_HUE, SURFACE_STORAGE_KEY);
        if (legacy) {
          hue = legacy.hue;
          if (legacy.chroma !== undefined) chroma = legacy.chroma;
        }
      }
      removeStoredKey(SURFACE_STORAGE_KEY);
      setSurfaceHueState(hue);
      setSurfaceChromaState(chroma);
    }
    if (!isAccentLocked) {
      const storedHue = resolveStoredHue(ACCENT_HUE_STORAGE_KEY);
      let hue = storedHue;
      let chroma = resolveStoredChroma(ACCENT_CHROMA_STORAGE_KEY);
      if (storedHue === null) {
        const legacy = resolveLegacyColourway(LEGACY_ACCENT_TO_HUE, ACCENT_STORAGE_KEY);
        if (legacy) {
          hue = legacy.hue;
          if (legacy.chroma !== undefined) chroma = legacy.chroma;
        }
      }
      removeStoredKey(ACCENT_STORAGE_KEY);
      setAccentHueState(hue);
      setAccentChromaState(chroma);
    }

    setHydrated(true);
  }, [isVisualStyleLocked, isSurfaceLocked, isAccentLocked]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    applyAppearanceToDocument({ colorScheme, visualStyle });
    // Effective values on unlocked axes — the saved number or the default —
    // and null under a lock, which is how the runtime knows to leave that
    // axis's properties off the root (all four null disengages the axis
    // attribute entirely: Effect Index renders its authored palette).
    applyChromaToDocument(
      isSurfaceLocked ? null : surfaceChroma,
      isAccentLocked ? null : accentChroma,
      isSurfaceLocked ? null : (savedSurfaceHue ?? DEFAULT_SURFACE_HUE),
      isAccentLocked ? null : (savedAccentHue ?? DEFAULT_ACCENT_HUE),
    );
    persistPreference(COLOR_SCHEME_STORAGE_KEY, colorScheme);

    if (!isVisualStyleLocked) {
      persistPreference(VISUAL_STYLE_STORAGE_KEY, visualStyle);
    }

    if (!isSurfaceLocked) {
      persistAxisNumber(SURFACE_CHROMA_STORAGE_KEY, savedSurfaceChroma);
      persistAxisNumber(SURFACE_HUE_STORAGE_KEY, savedSurfaceHue);
    }
    if (!isAccentLocked) {
      persistAxisNumber(ACCENT_CHROMA_STORAGE_KEY, savedAccentChroma);
      persistAxisNumber(ACCENT_HUE_STORAGE_KEY, savedAccentHue);
    }
  }, [hydrated, colorScheme, visualStyle, surfaceChroma, accentChroma, savedSurfaceChroma, savedAccentChroma, savedSurfaceHue, savedAccentHue, isVisualStyleLocked, isSurfaceLocked, isAccentLocked]);

  const setVisualStyle = useCallback(
    (value: VisualStyle) => {
      if (isVisualStyleLocked) {
        return;
      }

      setVisualStyleState(value);
    },
    [isVisualStyleLocked],
  );

  const setSurfaceChroma = useCallback(
    (value: number | null) => {
      if (!isSurfaceLocked) {
        setSurfaceChromaState(value === null ? null : Math.min(Math.max(value, 0), 1));
      }
    },
    [isSurfaceLocked],
  );

  const setAccentChroma = useCallback(
    (value: number | null) => {
      if (!isAccentLocked) {
        setAccentChromaState(value === null ? null : Math.min(Math.max(value, 0), 1));
      }
    },
    [isAccentLocked],
  );

  const setSurfaceHue = useCallback(
    (value: number | null) => {
      if (!isSurfaceLocked) {
        setSurfaceHueState(value === null ? null : clampHueDegrees(value));
      }
    },
    [isSurfaceLocked],
  );

  const setAccentHue = useCallback(
    (value: number | null) => {
      if (!isAccentLocked) {
        setAccentHueState(value === null ? null : clampHueDegrees(value));
      }
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
      setColorScheme,
      setVisualStyle,
      surfaceChroma,
      accentChroma,
      setSurfaceChroma,
      setAccentChroma,
      surfaceHue: savedSurfaceHue,
      accentHue: savedAccentHue,
      setSurfaceHue,
      setAccentHue,
      toggleColorScheme,
      toggleVisualStyle,
      isVisualStyleLocked,
      isAccentLocked,
      isSurfaceLocked,
    }),
    [
      colorScheme,
      visualStyle,
      setVisualStyle,
      surfaceChroma,
      accentChroma,
      setSurfaceChroma,
      setAccentChroma,
      savedSurfaceHue,
      savedAccentHue,
      setSurfaceHue,
      setAccentHue,
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
