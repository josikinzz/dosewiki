import type { ColorScheme, VisualStyle } from "@/theme";
import {
  THEME_LAB_OVERRIDE_STYLE_ID,
  buildOverrideCss,
  type PaletteOverrides,
} from "./themeLabStorage";
import { ALL_TOKEN_IDS } from "./paletteTokens";

export type ThemeDefaults = Record<ColorScheme, Record<string, string>>;

const THEMES: ColorScheme[] = ["dark", "light"];
const SAMPLE_STYLE_ID = "theme-lab-baseline-sample";
const STYLE_ATTRIBUTE = "data-visual-style";

const cache = new Map<string, ThemeDefaults>();

function emptyDefaults(): ThemeDefaults {
  return { dark: {}, light: {} };
}

function restoreAttribute(root: HTMLElement, name: string, previous: string | null): void {
  if (previous === null) root.removeAttribute(name);
  else root.setAttribute(name, previous);
}

function sampleDefaults(base: PaletteOverrides, visualStyle: VisualStyle): ThemeDefaults {
  const result = emptyDefaults();
  if (typeof document === "undefined") return result;

  const root = document.documentElement;
  const previousTheme = root.getAttribute("data-theme");
  const previousStyle = root.getAttribute(STYLE_ATTRIBUTE);
  const overrideEl = document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID);
  const overrideText = overrideEl?.textContent ?? "";
  const sample = document.createElement("style");
  sample.id = SAMPLE_STYLE_ID;

  try {
    if (overrideEl) overrideEl.textContent = "";

    root.setAttribute(STYLE_ATTRIBUTE, visualStyle);

    sample.textContent = buildOverrideCss(base);
    document.head.appendChild(sample);

    for (const theme of THEMES) {
      root.setAttribute("data-theme", theme);
      const computed = getComputedStyle(root);
      for (const id of ALL_TOKEN_IDS) {
        result[theme][id] = computed.getPropertyValue(id).trim();
      }
    }
  } finally {
    sample.remove();
    restoreAttribute(root, "data-theme", previousTheme);
    restoreAttribute(root, STYLE_ATTRIBUTE, previousStyle);
    if (overrideEl) overrideEl.textContent = overrideText;
  }

  return result;
}

function variantKey(cacheKey: string, visualStyle: VisualStyle): string {
  return `${visualStyle}:${cacheKey}`;
}

export function getThemeBaselines(
  cacheKey: string,
  visualStyle: VisualStyle,
  base: PaletteOverrides,
): ThemeDefaults {
  const key = variantKey(cacheKey, visualStyle);
  const cached = cache.get(key);
  if (cached) return cached;
  const sampled = sampleDefaults(base, visualStyle);
  cache.set(key, sampled);
  return sampled;
}

export function sampleRenderedTokens(
  ids: readonly string[],
  at: { visualStyle: VisualStyle; colorScheme: ColorScheme },
): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof document === "undefined") return result;

  const root = document.documentElement;
  const previousStyle = root.getAttribute(STYLE_ATTRIBUTE);
  const previousTheme = root.getAttribute("data-theme");

  try {
    root.setAttribute(STYLE_ATTRIBUTE, at.visualStyle);
    root.setAttribute("data-theme", at.colorScheme);
    const computed = getComputedStyle(root);
    for (const id of ids) result[id] = computed.getPropertyValue(id).trim();
  } finally {
    restoreAttribute(root, STYLE_ATTRIBUTE, previousStyle);
    restoreAttribute(root, "data-theme", previousTheme);
  }

  return result;
}
