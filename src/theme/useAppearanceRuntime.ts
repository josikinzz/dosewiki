"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  ACCENT_CHROMA_STORAGE_KEY,
  ACCENT_HUE_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  FONT_STORAGE_KEY,
  LETTER_SPACING_STORAGE_KEY,
  LINE_HEIGHT_STORAGE_KEY,
  SURFACE_CHROMA_STORAGE_KEY,
  SURFACE_HUE_STORAGE_KEY,
  TEXT_SIZE_STORAGE_KEY,
  THEME_META_ID,
  VISUAL_STYLE_STORAGE_KEY,
  getAppearanceMetaColor,
  type Appearance,
  type ColorScheme,
  type ColorSchemePreference,
  type FontPreference,
  type VisualStyle,
} from "@/theme";
import {
  ensureColorSchemeStylesheet,
  ensureVisualStyleStylesheet,
  whenStylesheetLoaded,
} from "@/theme/appearanceSheets";
import { applyChromaToDocument } from "@/theme/appearanceChroma";
import { applyReaderTypeToDocument } from "@/theme/appearanceTypography";
import {
  EMPTY_CHROMA_SLOTS,
  persistAxisNumber,
  persistPreference,
  removeStoredKey,
  type ChromaSlots,
} from "@/theme/appearanceStorageRuntime";

const AXIS_PERSIST_DEBOUNCE_MS = 200;
const CHROMA_PAINT_BUDGET_MS = 24;
const CHROMA_PAINT_MAX_DELAY_MS = 1000;
let transitionLockSequence = 0;
let applyAppearanceSequence = 0;

function withTransitionsSuppressed(mutate: () => void) {
  if (typeof document === "undefined" || typeof requestAnimationFrame !== "function") {
    mutate();
    return;
  }
  const root = document.documentElement;
  const sequence = ++transitionLockSequence;
  root.setAttribute("data-appearance-transition-lock", "");
  mutate();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (sequence === transitionLockSequence) root.removeAttribute("data-appearance-transition-lock");
    });
  });
}

function flipAppearanceAttributes({
  colorScheme,
  visualStyle,
}: Pick<Appearance, "colorScheme" | "visualStyle">) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (root.dataset.theme !== colorScheme || root.dataset.visualStyle !== visualStyle) {
    withTransitionsSuppressed(() => {
      root.dataset.theme = colorScheme;
      root.dataset.visualStyle = visualStyle;
    });
  }
  root.style.colorScheme = colorScheme;
  const meta =
    document.getElementById(THEME_META_ID) ??
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta instanceof HTMLMetaElement) {
    meta.content = getAppearanceMetaColor({ colorScheme, visualStyle });
  }
}

function applyAppearanceToDocument({
  colorScheme,
  visualStyle,
}: Pick<Appearance, "colorScheme" | "visualStyle">) {
  if (typeof document === "undefined") return;
  const sequence = ++applyAppearanceSequence;
  const pendingSheets = [
    ensureColorSchemeStylesheet(colorScheme),
    ensureVisualStyleStylesheet(visualStyle),
  ].filter((link): link is HTMLLinkElement => link !== null && link.sheet === null);
  if (pendingSheets.length > 0) {
    void Promise.all(pendingSheets.map(whenStylesheetLoaded)).then(() => {
      if (sequence === applyAppearanceSequence) flipAppearanceAttributes({ colorScheme, visualStyle });
    });
    return;
  }
  flipAppearanceAttributes({ colorScheme, visualStyle });
}

export function useSystemColorScheme(setSystemColorScheme: Dispatch<SetStateAction<ColorScheme>>) {
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const sync = () => setSystemColorScheme(query.matches ? "light" : "dark");
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [setSystemColorScheme]);
}

type RuntimeOptions = {
  hydrated: boolean;
  colorScheme: ColorScheme;
  colorSchemePreference: ColorSchemePreference;
  visualStyle: VisualStyle;
  fontPreference: FontPreference;
  savedChroma: Record<string, ChromaSlots>;
  surfaceChroma: number;
  accentChroma: number;
  effectiveSurfaceHue: number;
  effectiveAccentHue: number;
  savedTextSize: number | null;
  savedLetterSpacing: number | null;
  savedLineHeight: number | null;
  isVisualStyleLocked: boolean;
  isSurfaceLocked: boolean;
  isAccentLocked: boolean;
  isFontLocked: boolean;
  isColorSchemePersistent: boolean;
};

export function useAppearanceRuntime(options: RuntimeOptions) {
  const frameRef = useRef<number | null>(null);
  const pendingPersistRef = useRef<(() => void) | null>(null);
  const paintAtRef = useRef(0);
  const paintCostRef = useRef(0);
  const delayTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!options.hydrated) return;
    applyAppearanceToDocument(options);
    if (options.isColorSchemePersistent) {
      persistPreference(COLOR_SCHEME_STORAGE_KEY, options.colorSchemePreference);
    }
    if (!options.isVisualStyleLocked) {
      persistPreference(VISUAL_STYLE_STORAGE_KEY, options.visualStyle);
    }
  }, [options.hydrated, options.colorScheme, options.colorSchemePreference, options.visualStyle, options.isVisualStyleLocked, options.isColorSchemePersistent]);

  useEffect(() => {
    if (!options.hydrated || options.isFontLocked) return;
    const root = document.documentElement;
    const nextFont = options.fontPreference === "standard" ? undefined : options.fontPreference;
    if (root.dataset.font !== nextFont) {
      withTransitionsSuppressed(() => {
        if (nextFont) root.dataset.font = nextFont;
        else delete root.dataset.font;
      });
    }
    if (nextFont) persistPreference(FONT_STORAGE_KEY, nextFont);
    else removeStoredKey(FONT_STORAGE_KEY);
  }, [options.hydrated, options.fontPreference, options.isFontLocked]);

  useEffect(() => {
    if (!options.hydrated) return;
    const write = () => {
      applyChromaToDocument(
        options.isSurfaceLocked ? null : options.surfaceChroma,
        options.isAccentLocked ? null : options.accentChroma,
        options.isSurfaceLocked ? null : options.effectiveSurfaceHue,
        options.isAccentLocked ? null : options.effectiveAccentHue,
      );
      applyReaderTypeToDocument({
        textSize: options.isFontLocked ? null : options.savedTextSize,
        letterSpacing: options.isFontLocked ? null : options.savedLetterSpacing,
        lineHeight: options.isFontLocked ? null : options.savedLineHeight,
      });
    };
    if (typeof requestAnimationFrame !== "function") {
      write();
      return;
    }
    const paint = () => {
      frameRef.current = null;
      const start = performance.now();
      write();
      paintAtRef.current = start;
      requestAnimationFrame(() => {
        paintCostRef.current = performance.now() - start;
      });
    };
    const cost = paintCostRef.current;
    const spacing = cost > CHROMA_PAINT_BUDGET_MS
      ? Math.min(cost * 2, CHROMA_PAINT_MAX_DELAY_MS)
      : 0;
    const waitLeft = paintAtRef.current + spacing - performance.now();
    if (waitLeft > 0) {
      delayTimerRef.current = window.setTimeout(() => {
        delayTimerRef.current = null;
        frameRef.current = requestAnimationFrame(paint);
      }, waitLeft);
    } else {
      frameRef.current = requestAnimationFrame(paint);
    }
    return () => {
      if (delayTimerRef.current !== null) {
        window.clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [options.hydrated, options.surfaceChroma, options.accentChroma, options.effectiveSurfaceHue, options.effectiveAccentHue, options.savedTextSize, options.savedLetterSpacing, options.savedLineHeight, options.isSurfaceLocked, options.isAccentLocked, options.isFontLocked]);

  useEffect(() => {
    if (!options.hydrated || (options.isSurfaceLocked && options.isAccentLocked && options.isFontLocked)) return;
    const persist = () => {
      if (pendingPersistRef.current === persist) pendingPersistRef.current = null;
      if (!options.isSurfaceLocked) {
        for (const look of ["fun", "pro"] as const) {
          const slots = options.savedChroma[look] ?? EMPTY_CHROMA_SLOTS;
          persistAxisNumber(`${SURFACE_CHROMA_STORAGE_KEY}-${look}`, slots.surfaceChroma);
          persistAxisNumber(`${SURFACE_HUE_STORAGE_KEY}-${look}`, slots.surfaceHue);
        }
      }
      if (!options.isAccentLocked) {
        for (const look of ["fun", "pro"] as const) {
          const slots = options.savedChroma[look] ?? EMPTY_CHROMA_SLOTS;
          persistAxisNumber(`${ACCENT_CHROMA_STORAGE_KEY}-${look}`, slots.accentChroma);
          persistAxisNumber(`${ACCENT_HUE_STORAGE_KEY}-${look}`, slots.accentHue);
        }
      }
      if (!options.isFontLocked) {
        persistAxisNumber(TEXT_SIZE_STORAGE_KEY, options.savedTextSize);
        persistAxisNumber(LETTER_SPACING_STORAGE_KEY, options.savedLetterSpacing);
        persistAxisNumber(LINE_HEIGHT_STORAGE_KEY, options.savedLineHeight);
      }
    };
    pendingPersistRef.current = persist;
    const timer = setTimeout(persist, AXIS_PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [options.hydrated, options.savedChroma, options.savedTextSize, options.savedLetterSpacing, options.savedLineHeight, options.isSurfaceLocked, options.isAccentLocked, options.isFontLocked]);

  useEffect(() => {
    const flush = () => pendingPersistRef.current?.();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
}
