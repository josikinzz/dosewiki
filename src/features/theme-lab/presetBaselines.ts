import type { ColorScheme } from "@/theme";
import {
  PALETTE_ATTRIBUTE,
  PALETTE_LAB_OVERRIDE_STYLE_ID,
  buildOverrideCss,
  type PaletteOverrides,
} from "./paletteLabStorage";
import { ALL_TOKEN_IDS } from "./paletteTokens";

/**
 * Revert baselines: *the value a token has on this theme when the visitor has
 * not touched it*.
 *
 * This has to be sampled, not read off the preset, because most of the palette
 * derives from a handful of seeds — a preset that re-seats `--c-brand` changes
 * hundreds of tokens it never names. Without sampling per theme, "reset this
 * token" and the delete-on-equal rule in the token-write path would compare
 * against the *stock* look and either restore the wrong color or keep a
 * redundant edit around forever.
 *
 * Cost: one synchronous double computed-style pass over every token. Cached per
 * theme, so switching back and forth is free after the first visit; the panel
 * calls it from a layout effect so the values are in place before paint.
 */

/** Token values per theme, as they render with no user edit in play. */
export type ThemeDefaults = Record<ColorScheme, Record<string, string>>;

const THEMES: ColorScheme[] = ["dark", "light"];
const SAMPLE_STYLE_ID = "palette-lab-baseline-sample";

const cache = new Map<string, ThemeDefaults>();

function emptyDefaults(): ThemeDefaults {
  return { dark: {}, light: {} };
}

/**
 * Read both themes' token values with `base` staged and the lab's own override
 * element neutralized, then put the document back exactly as it was. Everything
 * happens inside one synchronous block, so nothing is ever painted mid-sample.
 */
function sampleDefaults(base: PaletteOverrides): ThemeDefaults {
  const result = emptyDefaults();
  if (typeof document === "undefined") return result;

  const root = document.documentElement;
  const hadTheme = root.hasAttribute("data-theme");
  const previousTheme = root.getAttribute("data-theme");

  // Two things now paint the visitor's look, and both have to be neutralized or
  // the "pristine" sample comes back carrying the very values it is supposed to
  // be the baseline for: the injected element (custom-slot tokens plus edits)…
  const overrideEl = document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID);
  const overrideText = overrideEl?.textContent ?? "";
  if (overrideEl) overrideEl.textContent = "";

  // …and the palette attribute, which switches on a compiled preset block in
  // the global stylesheet. Removed rather than re-pointed: `base` below is the
  // authoritative statement of what this theme's own values are, and it must be
  // the only preset layer in play while sampling.
  const hadPalette = root.hasAttribute(PALETTE_ATTRIBUTE);
  const previousPalette = root.getAttribute(PALETTE_ATTRIBUTE);
  if (hadPalette) root.removeAttribute(PALETTE_ATTRIBUTE);

  // Stage this theme's own layer at the same specificity the lab renders it at.
  // The user-layer selector matches on `data-theme` alone, so stripping the
  // palette attribute above does not silence what we are staging.
  const sample = document.createElement("style");
  sample.id = SAMPLE_STYLE_ID;
  sample.textContent = buildOverrideCss(base);
  document.head.appendChild(sample);

  try {
    for (const theme of THEMES) {
      root.dataset.theme = theme;
      const computed = getComputedStyle(root);
      for (const id of ALL_TOKEN_IDS) {
        result[theme][id] = computed.getPropertyValue(id).trim();
      }
    }
  } finally {
    sample.remove();
    if (hadTheme && previousTheme) root.setAttribute("data-theme", previousTheme);
    else root.removeAttribute("data-theme");
    if (hadPalette && previousPalette !== null) {
      root.setAttribute(PALETTE_ATTRIBUTE, previousPalette);
    }
    if (overrideEl) overrideEl.textContent = overrideText;
  }

  return result;
}

/**
 * Baselines for one theme, cached under `cacheKey` (the active theme's storage
 * key, so shipped presets and custom slots never share an entry).
 */
export function getThemeBaselines(cacheKey: string, base: PaletteOverrides): ThemeDefaults {
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const sampled = sampleDefaults(base);
  cache.set(cacheKey, sampled);
  return sampled;
}

/**
 * Forget cached samples: one theme's when `cacheKey` is given (a deleted custom
 * slot, whose key a later slot could be handed again), otherwise all of them
 * (tests install fresh stylesheets between cases).
 */
export function clearThemeBaselineCache(cacheKey?: string): void {
  if (cacheKey === undefined) cache.clear();
  else cache.delete(cacheKey);
}
