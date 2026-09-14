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
import { getDefaultAppearanceColors } from "@/theme/appearanceChroma";
import {
  type ColorSchemePreference,
  type ColorScheme,
  type FontPreference,
  type VisualStyle,
} from "@/theme";
import {
  clampAxisNumber,
  DEFAULT_LETTER_SPACING_LEXEND,
  DEFAULT_LETTER_SPACING_STANDARD,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_TEXT_SIZE,
  READER_LEADING_RANGE,
  READER_TRACKING_RANGE,
  TEXT_SIZE_RANGE,
} from "@/theme/appearanceTypography";
import {
  EMPTY_CHROMA_SLOTS,
  hydrateStoredAppearance,
  type ChromaSlots,
} from "@/theme/appearanceStorageRuntime";
import { useAppearanceRuntime, useSystemColorScheme } from "@/theme/useAppearanceRuntime";

function clampHueDegrees(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 359);
}

export type {
  ColorScheme,
  ColorSchemePreference,
  FontPreference,
  VisualStyle,
} from "@/theme";
export {
  ACCENT_CHROMA_STORAGE_KEY,
  ACCENT_HUE_STORAGE_KEY,
  // The retired colourway keys: still exported because the migration below is
  // observable — tests and the bootstrap name them — not because anything may
  // write them again.
  ACCENT_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  FONT_STORAGE_KEY,
  LETTER_SPACING_STORAGE_KEY,
  LINE_HEIGHT_STORAGE_KEY,
  TEXT_SIZE_STORAGE_KEY,
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
  /** The resolved scheme the document is painted with — never "system". */
  colorScheme: ColorScheme;
  /**
   * What the reader chose: an explicit scheme, or "system" — follow the OS
   * `prefers-color-scheme` live. This is what the Mode control renders and
   * what the storage key holds; `colorScheme` is its resolution.
   */
  colorSchemePreference: ColorSchemePreference;
  visualStyle: VisualStyle;
  setColorScheme: (value: ColorScheme) => void;
  setColorSchemePreference: (value: ColorSchemePreference) => void;
  setVisualStyle: (value: VisualStyle) => void;
  toggleColorScheme: () => void;
  toggleVisualStyle: () => void;
  /**
   * The effective saturation levels — always a decimal in 0..1: the reader's
   * saved level, or the current appearance combination's default while they
   * have never moved that slider. The setters take null to mean "back to the
   * default level": the storage key is removed — a default is never written —
   * and the exposed level returns to the current combination's default. Each
   * level rides its parent axis's lock.
   */
  surfaceChroma: number;
  accentChroma: number;
  setSurfaceChroma: (value: number | null) => void;
  setAccentChroma: (value: number | null) => void;
  /**
   * The hue axes: the reader's saved rotation in integer degrees 0..359, or
   * null while they never moved that slider — null means the current
   * visual-style and colour-scheme combination's default. Consumers resolve
   * the effective hue. The setters take null on the chroma setters' terms: key
   * removed, back to the default.
   */
  surfaceHue: number | null;
  accentHue: number | null;
  setSurfaceHue: (value: number | null) => void;
  setAccentHue: (value: number | null) => void;
  /**
   * Whether any colour axis is currently carrying a saved value rather than the
   * appearance combination's default. Derived here because the hues are exposed
   * as saved but the levels are exposed resolved, so a consumer cannot tell the
   * two apart: it is what lets the reader's panel offer a reset only once there
   * is something to reset.
   */
  hasCustomColors: boolean;
  /**
   * The type axis: the face the two `--font-family-*` tokens resolve to. "standard" is
   * the site default every dose.wiki reader opens on — the authored base.css pairing of
   * the Inter body face and the Blinker display face — and is expressed by *removing* the
   * root attribute and the storage key, so a reader on the default face stores nothing;
   * each other face re-seats both tokens via `data-font="<face>"` on the root. An
   * untoggled reader fetches no face beyond the ones every page already paints.
   */
  fontPreference: FontPreference;
  setFontPreference: (value: FontPreference) => void;
  /**
   * The reading-type axes: the reader's *saved* value, or null while they never moved
   * that slider — null is the persistence state, and the site default is the absence of
   * the root write, never a stored number. Text size is a unitless font scale on its
   * slider domain (it multiplies the text tokens, never the layout); letter spacing is
   * em, line height unitless. The setters take null to mean
   * "back to the default": the storage key is removed and the axis disengages. All
   * three ride the font axis's lock: under a lock the setters are no-ops and the keys
   * are never read or written. Paragraph spacing is not an axis: that rhythm is a
   * fixed site value (2x the font size).
   */
  textSize: number | null;
  letterSpacing: number | null;
  lineHeight: number | null;
  setTextSize: (value: number | null) => void;
  setLetterSpacing: (value: number | null) => void;
  setLineHeight: (value: number | null) => void;
  /**
   * Whether the type axis is currently carrying any saved value — the face choice or
   * any of the three reading-type numbers. It is what lets the panel offer "Reset to
   * defaults", on the colour axes' terms.
   */
  hasCustomType: boolean;
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
  /** Same contract for the type axis: under a lock the font setters are no-ops. */
  isFontLocked: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  initialColorScheme = SITE_FLAVOR_CONFIG.defaultColorScheme,
  initialVisualStyle = SITE_FLAVOR_CONFIG.defaultVisualStyle,
  isVisualStyleLocked = !SITE_FLAVOR_CONFIG.showVisualStyleToggle,
  isAccentLocked = !SITE_FLAVOR_CONFIG.showAccentPicker,
  isSurfaceLocked = !SITE_FLAVOR_CONFIG.showSurfacePicker,
  isFontLocked = !SITE_FLAVOR_CONFIG.showFontToggle,
  isColorSchemePersistent = true,
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
  /** Pins the type axis: the font setters become no-ops and its key is never read or written. */
  isFontLocked?: boolean;
  /** Embedded hosts may adapt their document without changing the reader's saved scheme. */
  isColorSchemePersistent?: boolean;
}) {
  /**
   * The saved axis value — possibly "system" — and the OS scheme it resolves
   * through. The painted scheme is derived, never stored: while the
   * preference is "system" it tracks `prefers-color-scheme` live, so an OS
   * day/night flip restyles the page with no reload. The OS scheme opens on
   * the server's guess and is corrected by the matchMedia effect on mount,
   * before `hydrated` lets anything paint or persist.
   */
  const [colorSchemePreference, setColorSchemePreferenceState] =
    useState<ColorSchemePreference>(initialColorScheme);
  const [systemColorScheme, setSystemColorScheme] = useState<ColorScheme>(initialColorScheme);
  const colorScheme =
    colorSchemePreference === "system" ? systemColorScheme : colorSchemePreference;
  const [visualStyle, setVisualStyleState] = useState<VisualStyle>(initialVisualStyle);
  const [fontPreference, setFontPreferenceState] = useState<FontPreference>("standard");
  /**
   * The reading-type axes' saved slots, on the saved-colour-coordinates' exact terms:
   * null while the reader never moved that slider, effective values resolved by the
   * consumers, persistence removes the key on null so a default is never written.
   * All three ride the font axis's lock.
   */
  const [savedTextSize, setTextSizeState] = useState<number | null>(null);
  const [savedLetterSpacing, setLetterSpacingState] = useState<number | null>(null);
  const [savedLineHeight, setLineHeightState] = useState<number | null>(null);
  /**
   * The colour axes' saved coordinates per look, or null per slot while the reader
   * never moved that slider under that look. Null is the persistence state, not the
   * display one: effective values resolve through the appearance-default matrix, and
   * the persist effect removes the key on null so a default is never written into
   * storage. Hue remains exposed as null so consumers can distinguish "never chose"
   * from a saved coordinate.
   *
   * The axes are independent per look and SHARED across light/dark: a saved
   * coordinate rides only the style it was tuned under — Clinical keeps its hue
   * while Vivid keeps hers — but flipping the Mode toggle never moves it, because
   * light and dark are one hue world at two lightness worlds. A reader with nothing
   * saved for a look follows the authored defaults. Effective values are derived
   * here, never captured.
   */
  const [savedChroma, setSavedChromaState] = useState<Record<string, ChromaSlots>>({});
  const chromaSlots = savedChroma[visualStyle] ?? EMPTY_CHROMA_SLOTS;
  const defaultColors = getDefaultAppearanceColors(visualStyle, colorScheme);
  const surfaceChroma = chromaSlots.surfaceChroma ?? defaultColors.surfaceLevel;
  const accentChroma = chromaSlots.accentChroma ?? defaultColors.accentLevel;
  const effectiveSurfaceHue = chromaSlots.surfaceHue ?? defaultColors.surfaceHue;
  const effectiveAccentHue = chromaSlots.accentHue ?? defaultColors.accentHue;
  // A locked axis stores nothing, so its saved slots stay null and it never
  // claims a customization the reader could not have made.
  const hasCustomColors =
    chromaSlots.surfaceChroma !== null ||
    chromaSlots.accentChroma !== null ||
    chromaSlots.surfaceHue !== null ||
    chromaSlots.accentHue !== null;
  const hasCustomType =
    fontPreference !== "standard" ||
    savedTextSize !== null ||
    savedLetterSpacing !== null ||
    savedLineHeight !== null;
  /**
   * Until the mount effect has read back what the bootstrap resolved, this provider is still
   * holding the server's opening guess. Applying it would be harmless — the document already
   * says so — but *persisting* it would overwrite a saved preference with a default the reader
   * never chose, so both effects wait for this.
   */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const stored = hydrateStoredAppearance({
      initialColorScheme,
      initialVisualStyle,
      isVisualStyleLocked,
      isSurfaceLocked,
      isAccentLocked,
      isFontLocked,
      isColorSchemePersistent,
    });
    if (isColorSchemePersistent) {
      setColorSchemePreferenceState(stored.colorSchemePreference);
    }
    if (!isVisualStyleLocked) {
      setVisualStyleState(stored.visualStyle);
    }
    if (!isFontLocked) {
      setFontPreferenceState(stored.fontPreference);
      setTextSizeState(stored.textSize);
      setLetterSpacingState(stored.letterSpacing);
      setLineHeightState(stored.lineHeight);
    }
    if (!isSurfaceLocked || !isAccentLocked) {
      const migrated = stored.savedChroma.fun ?? EMPTY_CHROMA_SLOTS;
      setSavedChromaState((current) => ({
        ...current,
        fun: {
          surfaceChroma: isSurfaceLocked ? current.fun?.surfaceChroma ?? null : migrated.surfaceChroma,
          accentChroma: isAccentLocked ? current.fun?.accentChroma ?? null : migrated.accentChroma,
          surfaceHue: isSurfaceLocked ? current.fun?.surfaceHue ?? null : migrated.surfaceHue,
          accentHue: isAccentLocked ? current.fun?.accentHue ?? null : migrated.accentHue,
        },
        pro: current.pro ?? { ...EMPTY_CHROMA_SLOTS },
      }));
    }
    setHydrated(true);
  }, [isVisualStyleLocked, isSurfaceLocked, isAccentLocked, isFontLocked, isColorSchemePersistent]);

  useSystemColorScheme(setSystemColorScheme);
  useAppearanceRuntime({
    hydrated,
    colorScheme,
    colorSchemePreference,
    visualStyle,
    fontPreference,
    savedChroma,
    surfaceChroma,
    accentChroma,
    effectiveSurfaceHue,
    effectiveAccentHue,
    savedTextSize,
    savedLetterSpacing,
    savedLineHeight,
    isVisualStyleLocked,
    isSurfaceLocked,
    isAccentLocked,
    isFontLocked,
    isColorSchemePersistent,
  });

  const setVisualStyle = useCallback(
    (value: VisualStyle) => {
      if (isVisualStyleLocked) {
        return;
      }

      setVisualStyleState(value);
    },
    [isVisualStyleLocked],
  );

  const setFontPreference = useCallback(
    (value: FontPreference) => {
      if (isFontLocked) {
        return;
      }

      setFontPreferenceState(value);
    },
    [isFontLocked],
  );

  // Null is the setters' "back to the site default": the storage key is removed and the
  // axis's root write disengages. Every clamp is the slider's own domain, so a value can
  // only arrive here through the control that owns that domain — and a value equal to the
  // resting default IS the default, so it stores nothing: dragging the thumb back to
  // where it started must land the document in exactly the never-touched state, not a
  // saved copy of it. That is the never-write-a-default rule every other axis follows.
  const setTextSize = useCallback(
    (value: number | null) => {
      if (!isFontLocked) {
        if (value === null) {
          setTextSizeState(null);
          return;
        }
        const next = Number(
          clampAxisNumber(value, TEXT_SIZE_RANGE[0], TEXT_SIZE_RANGE[1]).toFixed(2),
        );
        setTextSizeState(next === DEFAULT_TEXT_SIZE ? null : next);
      }
    },
    [isFontLocked],
  );

  const setLetterSpacing = useCallback(
    (value: number | null) => {
      if (!isFontLocked) {
        if (value === null) {
          setLetterSpacingState(null);
          return;
        }
        const next = Number(
          clampAxisNumber(value, READER_TRACKING_RANGE[0], READER_TRACKING_RANGE[1]).toFixed(2),
        );
        // The resting tracking follows the face: Lexend's letterfit is the default
        // face's whole point (0), the authored faces carry the negative body ramp.
        const resting =
          fontPreference === "lexend" ? DEFAULT_LETTER_SPACING_LEXEND : DEFAULT_LETTER_SPACING_STANDARD;
        setLetterSpacingState(next === resting ? null : next);
      }
    },
    [isFontLocked, fontPreference],
  );

  const setLineHeight = useCallback(
    (value: number | null) => {
      if (!isFontLocked) {
        if (value === null) {
          setLineHeightState(null);
          return;
        }
        const next = Number(
          clampAxisNumber(value, READER_LEADING_RANGE[0], READER_LEADING_RANGE[1]).toFixed(2),
        );
        setLineHeightState(next === DEFAULT_LINE_HEIGHT ? null : next);
      }
    },
    [isFontLocked],
  );

  // The colour setters write the CURRENT look's slots only: Vivid and Clinical keep
  // independent coordinates, while light and dark share them (the Mode toggle is a
  // lightness world, not a hue world). Null is the "back to the site default" state:
  // the storage key is removed and the slot disengages.
  const setSurfaceChroma = useCallback(
    (value: number | null) => {
      if (!isSurfaceLocked) {
        setSavedChromaState((current) => ({
          ...current,
          [visualStyle]: {
            ...(current[visualStyle] ?? EMPTY_CHROMA_SLOTS),
            surfaceChroma: value === null ? null : Math.min(Math.max(value, 0), 1),
          },
        }));
      }
    },
    [isSurfaceLocked, visualStyle],
  );

  const setAccentChroma = useCallback(
    (value: number | null) => {
      if (!isAccentLocked) {
        setSavedChromaState((current) => ({
          ...current,
          [visualStyle]: {
            ...(current[visualStyle] ?? EMPTY_CHROMA_SLOTS),
            accentChroma: value === null ? null : Math.min(Math.max(value, 0), 1),
          },
        }));
      }
    },
    [isAccentLocked, visualStyle],
  );

  const setSurfaceHue = useCallback(
    (value: number | null) => {
      if (!isSurfaceLocked) {
        setSavedChromaState((current) => ({
          ...current,
          [visualStyle]: {
            ...(current[visualStyle] ?? EMPTY_CHROMA_SLOTS),
            surfaceHue: value === null ? null : clampHueDegrees(value),
          },
        }));
      }
    },
    [isSurfaceLocked, visualStyle],
  );

  const setAccentHue = useCallback(
    (value: number | null) => {
      if (!isAccentLocked) {
        setSavedChromaState((current) => ({
          ...current,
          [visualStyle]: {
            ...(current[visualStyle] ?? EMPTY_CHROMA_SLOTS),
            accentHue: value === null ? null : clampHueDegrees(value),
          },
        }));
      }
    },
    [isAccentLocked, visualStyle],
  );

  const setColorSchemePreference = useCallback((value: ColorSchemePreference) => {
    setColorSchemePreferenceState(value);
  }, []);

  const setColorScheme = useCallback((value: ColorScheme) => {
    setColorSchemePreferenceState(value);
  }, []);

  /**
   * Flips to the explicit opposite of the *resolved* scheme, so a system
   * reader who reaches for the toggle gets the scheme they were looking at,
   * inverted and pinned — never a no-op relative to what they see.
   */
  const toggleColorScheme = useCallback(() => {
    setColorSchemePreferenceState(colorScheme === "dark" ? "light" : "dark");
  }, [colorScheme]);

  const toggleVisualStyle = useCallback(() => {
    if (isVisualStyleLocked) {
      return;
    }

    setVisualStyleState((current) => (current === "pro" ? "fun" : "pro"));
  }, [isVisualStyleLocked]);

  const value = useMemo(
    () => ({
      colorScheme,
      colorSchemePreference,
      visualStyle,
      fontPreference,
      setColorScheme,
      setColorSchemePreference,
      setVisualStyle,
      setFontPreference,
      textSize: savedTextSize,
      letterSpacing: savedLetterSpacing,
      lineHeight: savedLineHeight,
      setTextSize,
      setLetterSpacing,
      setLineHeight,
      hasCustomType,
      surfaceChroma,
      accentChroma,
      setSurfaceChroma,
      setAccentChroma,
      surfaceHue: chromaSlots.surfaceHue,
      accentHue: chromaSlots.accentHue,
      setSurfaceHue,
      setAccentHue,
      hasCustomColors,
      toggleColorScheme,
      toggleVisualStyle,
      isVisualStyleLocked,
      isAccentLocked,
      isSurfaceLocked,
      isFontLocked,
    }),
    [
      colorScheme,
      colorSchemePreference,
      visualStyle,
      fontPreference,
      setColorScheme,
      setColorSchemePreference,
      setVisualStyle,
      setFontPreference,
      savedTextSize,
      savedLetterSpacing,
      savedLineHeight,
      setTextSize,
      setLetterSpacing,
      setLineHeight,
      hasCustomType,
      surfaceChroma,
      accentChroma,
      setSurfaceChroma,
      setAccentChroma,
      chromaSlots.surfaceHue,
      chromaSlots.accentHue,
      setSurfaceHue,
      setAccentHue,
      hasCustomColors,
      toggleColorScheme,
      toggleVisualStyle,
      isVisualStyleLocked,
      isSurfaceLocked,
      isAccentLocked,
      isFontLocked,
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
