import { ACCENT_ATTRIBUTE } from "@/theme/accentStylesheet";
import type { ColorScheme, VisualStyle } from "@/theme";
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
/** The visual-style axis, named here because the accent sampler below has to
 *  read a combination the editor is not currently wearing. */
const STYLE_ATTRIBUTE = "data-visual-style";

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

  // Three things now paint the visitor's look, and all of them have to be
  // neutralized or the "pristine" sample comes back carrying the very values it
  // is supposed to be the baseline for: the injected element (custom-slot tokens
  // plus edits)…
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

  // …and the accent attribute, which switches on a compiled accent block in the
  // generated sheet — a Fun colourway in Fun, `--ei-*` seeds in Pro. Left in
  // place it breaks the delete-on-equal rule outright: an editor whose token
  // value happens to match the accent's would have their edit read as "same as
  // pristine" and silently dropped, when the accent is a layer they are editing
  // *over*. Removed on the same terms as the palette attribute, and for the same
  // reason — `base` is the authoritative statement of this theme's own values.
  const hadAccent = root.hasAttribute(ACCENT_ATTRIBUTE);
  const previousAccent = root.getAttribute(ACCENT_ATTRIBUTE);
  if (hadAccent) root.removeAttribute(ACCENT_ATTRIBUTE);

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
    if (hadAccent && previousAccent !== null) {
      root.setAttribute(ACCENT_ATTRIBUTE, previousAccent);
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

/**
 * Read tokens exactly as they render in one appearance combination, with
 * everything that paints the visitor's look left in place.
 *
 * The mirror image of the baseline sampler above: nothing is neutralized,
 * because an accent export wants the *rendered* value — the accent block, the
 * colourway and the editor's own edits included. It exists because an accent's
 * shape spans combinations the editor is not currently wearing: the Pro seeds
 * cannot be read off a Fun page, and the measured swatch is the Fun-dark
 * `--theme-accent` however the editor happens to be viewing it.
 *
 * Synchronous like its neighbour, and it puts both attributes back exactly as it
 * found them, so no intermediate frame is ever painted.
 */
export function sampleRenderedTokens(
  ids: readonly string[],
  at: { visualStyle: VisualStyle; colorScheme: ColorScheme },
): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof document === "undefined") return result;

  const root = document.documentElement;
  const previousStyle = root.getAttribute(STYLE_ATTRIBUTE);
  const previousTheme = root.getAttribute("data-theme");

  root.setAttribute(STYLE_ATTRIBUTE, at.visualStyle);
  root.setAttribute("data-theme", at.colorScheme);
  try {
    const computed = getComputedStyle(root);
    for (const id of ids) result[id] = computed.getPropertyValue(id).trim();
  } finally {
    if (previousStyle === null) root.removeAttribute(STYLE_ATTRIBUTE);
    else root.setAttribute(STYLE_ATTRIBUTE, previousStyle);
    if (previousTheme === null) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", previousTheme);
  }

  return result;
}
