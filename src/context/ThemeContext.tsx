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

type ThemeContextValue = {
  colorScheme: ColorScheme;
  colorSchemePreference: ColorSchemePreference;
  visualStyle: VisualStyle;
  setColorScheme: (value: ColorScheme) => void;
  setColorSchemePreference: (value: ColorSchemePreference) => void;
  setVisualStyle: (value: VisualStyle) => void;
  toggleColorScheme: () => void;
  toggleVisualStyle: () => void;
  surfaceChroma: number;
  accentChroma: number;
  setSurfaceChroma: (value: number | null) => void;
  setAccentChroma: (value: number | null) => void;
  surfaceHue: number | null;
  accentHue: number | null;
  setSurfaceHue: (value: number | null) => void;
  setAccentHue: (value: number | null) => void;
  hasCustomColors: boolean;
  fontPreference: FontPreference;
  setFontPreference: (value: FontPreference) => void;
  textSize: number | null;
  letterSpacing: number | null;
  lineHeight: number | null;
  setTextSize: (value: number | null) => void;
  setLetterSpacing: (value: number | null) => void;
  setLineHeight: (value: number | null) => void;
  hasCustomType: boolean;
  isVisualStyleLocked: boolean;
  isAccentLocked: boolean;
  isSurfaceLocked: boolean;
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
  initialColorScheme?: ColorScheme;
  initialVisualStyle?: VisualStyle;
  isVisualStyleLocked?: boolean;
  isAccentLocked?: boolean;
  isSurfaceLocked?: boolean;
  isFontLocked?: boolean;
  isColorSchemePersistent?: boolean;
}) {
  const [colorSchemePreference, setColorSchemePreferenceState] =
    useState<ColorSchemePreference>(initialColorScheme);
  const [systemColorScheme, setSystemColorScheme] = useState<ColorScheme>(initialColorScheme);
  const colorScheme =
    colorSchemePreference === "system" ? systemColorScheme : colorSchemePreference;
  const [visualStyle, setVisualStyleState] = useState<VisualStyle>(initialVisualStyle);
  const [fontPreference, setFontPreferenceState] = useState<FontPreference>("standard");
  const [savedTextSize, setTextSizeState] = useState<number | null>(null);
  const [savedLetterSpacing, setLetterSpacingState] = useState<number | null>(null);
  const [savedLineHeight, setLineHeightState] = useState<number | null>(null);
  const [savedChroma, setSavedChromaState] = useState<Record<string, ChromaSlots>>({});
  const chromaSlots = savedChroma[visualStyle] ?? EMPTY_CHROMA_SLOTS;
  const defaultColors = getDefaultAppearanceColors(visualStyle, colorScheme);
  const surfaceChroma = chromaSlots.surfaceChroma ?? defaultColors.surfaceLevel;
  const accentChroma = chromaSlots.accentChroma ?? defaultColors.accentLevel;
  const effectiveSurfaceHue = chromaSlots.surfaceHue ?? defaultColors.surfaceHue;
  const effectiveAccentHue = chromaSlots.accentHue ?? defaultColors.accentHue;
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
