import { isVisualStyle } from "./visualStyle";
import {
  ACCENT_CHROMA_STORAGE_KEY,
  ACCENT_HUE_STORAGE_KEY,
  ACCENT_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  FONT_STORAGE_KEY,
  LETTER_SPACING_STORAGE_KEY,
  LINE_HEIGHT_STORAGE_KEY,
  SURFACE_CHROMA_STORAGE_KEY,
  SURFACE_HUE_STORAGE_KEY,
  SURFACE_STORAGE_KEY,
  TEXT_SIZE_STORAGE_KEY,
  VISUAL_STYLE_STORAGE_KEY,
  isColorScheme,
  isColorSchemePreference,
  isFontPreference,
  LEGACY_FONT_PREFERENCES,
  type ColorScheme,
  type ColorSchemePreference,
  type FontPreference,
  type VisualStyle,
} from "@/theme";
import { LEGACY_ACCENT_TO_HUE } from "@/theme/accents";
import { parseChromaLevel, parseHueDegrees } from "@/theme/appearanceChroma";
import {
  DEFAULT_LINE_HEIGHT,
  DEFAULT_TEXT_SIZE,
  parseAxisNumber,
  READER_LEADING_RANGE,
  READER_TRACKING_RANGE,
  TEXT_SIZE_RANGE,
} from "@/theme/appearanceTypography";
import { LEGACY_SURFACE_TO_HUE } from "@/theme/surfaces";

export type ChromaSlots = {
  surfaceChroma: number | null;
  accentChroma: number | null;
  surfaceHue: number | null;
  accentHue: number | null;
};

export const EMPTY_CHROMA_SLOTS: ChromaSlots = {
  surfaceChroma: null,
  accentChroma: null,
  surfaceHue: null,
  accentHue: null,
};

export function persistPreference(storageKey: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, value);
  } catch {
    // Keep the in-memory appearance active when storage is unavailable.
  }
}

export function persistAxisNumber(storageKey: string, value: number | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, String(value));
  } catch {
    // Keep the in-memory appearance active when storage is unavailable.
  }
}

export function removeStoredKey(storageKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // A key that cannot be removed also cannot be read later.
  }
}

type HydrationOptions = {
  initialColorScheme: ColorScheme;
  initialVisualStyle: VisualStyle;
  isVisualStyleLocked: boolean;
  isSurfaceLocked: boolean;
  isAccentLocked: boolean;
  isFontLocked: boolean;
  isColorSchemePersistent: boolean;
};

export type HydratedAppearance = {
  colorSchemePreference: ColorSchemePreference;
  visualStyle: VisualStyle;
  fontPreference: FontPreference;
  textSize: number | null;
  letterSpacing: number | null;
  lineHeight: number | null;
  savedChroma: Record<string, ChromaSlots>;
};

type AppearanceGuard<T extends string> = (value: string | null | undefined) => value is T;

function resolvePaintedAxis<T extends string>(
  datasetKey: "theme" | "visualStyle" | "font",
  storageKey: string,
  isSupported: AppearanceGuard<T>,
): T | null {
  if (typeof document !== "undefined") {
    const painted = document.documentElement.dataset[datasetKey];
    if (isSupported(painted)) return painted;
  }
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(storageKey);
    return isSupported(stored) ? stored : null;
  } catch {
    return null;
  }
}

function readAxis(storageKey: string, min: number, max: number) {
  try {
    return parseAxisNumber(window.localStorage.getItem(storageKey), min, max);
  } catch {
    return null;
  }
}

function resolveStoredChroma(storageKey: string): number | null {
  try {
    return parseChromaLevel(window.localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function resolveStoredHue(storageKey: string): number | null {
  try {
    return parseHueDegrees(window.localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function resolveLegacyColourway<K extends string>(
  map: Readonly<Record<K, { readonly hue: number; readonly chroma?: 0 }>>,
  storageKey: string,
): { readonly hue: number; readonly chroma?: 0 } | null {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return null;
    return Object.prototype.hasOwnProperty.call(map, stored) ? map[stored as K] : null;
  } catch {
    return null;
  }
}

export function hydrateStoredAppearance(options: HydrationOptions): HydratedAppearance {
  const result: HydratedAppearance = {
    colorSchemePreference: options.initialColorScheme,
    visualStyle: options.initialVisualStyle,
    fontPreference: "standard",
    textSize: null,
    letterSpacing: null,
    lineHeight: null,
    savedChroma: {},
  };

  let storedPreference: ColorSchemePreference | null = null;
  try {
    const stored = options.isColorSchemePersistent
      ? window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)
      : null;
    if (isColorSchemePreference(stored)) storedPreference = stored;
  } catch {
    // The painted attribute remains available below.
  }
  if (storedPreference) result.colorSchemePreference = storedPreference;
  else if (options.isColorSchemePersistent) {
    result.colorSchemePreference =
      resolvePaintedAxis("theme", COLOR_SCHEME_STORAGE_KEY, isColorScheme) ??
      result.colorSchemePreference;
  }

  if (!options.isVisualStyleLocked) {
    result.visualStyle =
      resolvePaintedAxis("visualStyle", VISUAL_STYLE_STORAGE_KEY, isVisualStyle) ??
      result.visualStyle;
  }

  if (!options.isFontLocked) {
    result.fontPreference =
      resolvePaintedAxis("font", FONT_STORAGE_KEY, isFontPreference) ?? result.fontPreference;
    try {
      const stored = window.localStorage.getItem(FONT_STORAGE_KEY);
      const migrated = stored == null ? null : LEGACY_FONT_PREFERENCES[stored];
      if (migrated) {
        persistPreference(FONT_STORAGE_KEY, migrated);
        result.fontPreference = migrated;
      }
    } catch {
      // A blocked read also cannot be rewritten.
    }
    const textSize = readAxis(TEXT_SIZE_STORAGE_KEY, ...TEXT_SIZE_RANGE);
    result.textSize = textSize === DEFAULT_TEXT_SIZE ? null : textSize;
    result.letterSpacing = readAxis(LETTER_SPACING_STORAGE_KEY, ...READER_TRACKING_RANGE);
    const lineHeight = readAxis(LINE_HEIGHT_STORAGE_KEY, ...READER_LEADING_RANGE);
    result.lineHeight = lineHeight === DEFAULT_LINE_HEIGHT ? null : lineHeight;
  }

  if (!options.isSurfaceLocked || !options.isAccentLocked) {
    const fun = { ...EMPTY_CHROMA_SLOTS };
    if (!options.isSurfaceLocked) {
      let hue = resolveStoredHue(`${SURFACE_HUE_STORAGE_KEY}-fun`);
      let chroma = resolveStoredChroma(`${SURFACE_CHROMA_STORAGE_KEY}-fun`);
      if (hue === null && chroma === null) {
        hue = resolveStoredHue(SURFACE_HUE_STORAGE_KEY);
        chroma = resolveStoredChroma(SURFACE_CHROMA_STORAGE_KEY);
      }
      if (hue === null) {
        const legacy = resolveLegacyColourway(LEGACY_SURFACE_TO_HUE, SURFACE_STORAGE_KEY);
        if (legacy) {
          hue = legacy.hue;
          if (legacy.chroma !== undefined) chroma = legacy.chroma;
        }
      }
      fun.surfaceChroma = chroma;
      fun.surfaceHue = hue;
      removeStoredKey(SURFACE_HUE_STORAGE_KEY);
      removeStoredKey(SURFACE_CHROMA_STORAGE_KEY);
      removeStoredKey(SURFACE_STORAGE_KEY);
    }
    if (!options.isAccentLocked) {
      let hue = resolveStoredHue(`${ACCENT_HUE_STORAGE_KEY}-fun`);
      let chroma = resolveStoredChroma(`${ACCENT_CHROMA_STORAGE_KEY}-fun`);
      if (hue === null && chroma === null) {
        hue = resolveStoredHue(ACCENT_HUE_STORAGE_KEY);
        chroma = resolveStoredChroma(ACCENT_CHROMA_STORAGE_KEY);
      }
      if (hue === null) {
        const legacy = resolveLegacyColourway(LEGACY_ACCENT_TO_HUE, ACCENT_STORAGE_KEY);
        if (legacy) {
          hue = legacy.hue;
          if (legacy.chroma !== undefined) chroma = legacy.chroma;
        }
      }
      fun.accentChroma = chroma;
      fun.accentHue = hue;
      removeStoredKey(ACCENT_HUE_STORAGE_KEY);
      removeStoredKey(ACCENT_CHROMA_STORAGE_KEY);
      removeStoredKey(ACCENT_STORAGE_KEY);
    }
    result.savedChroma = { fun, pro: { ...EMPTY_CHROMA_SLOTS } };
  }

  return result;
}
