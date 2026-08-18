import { ACCENT_ATTRIBUTE } from "@/theme/accentStylesheet";
import { SUPPORTED_VISUAL_STYLES, type ColorScheme, type VisualStyle } from "@/theme";
import {
  PALETTE_ATTRIBUTE,
  PALETTE_LAB_OVERRIDE_STYLE_ID,
  buildOverrideCss,
  type PaletteOverrides,
} from "./paletteLabStorage";
import { ALL_TOKEN_IDS } from "./paletteTokens";

/**
 * Revert baselines: *the value a token has on this theme, in the visual style
 * being worn, when the visitor has not touched it*.
 *
 * This has to be sampled, not read off the preset, because most of the palette
 * derives from a handful of seeds — a preset that re-seats `--c-brand` changes
 * hundreds of tokens it never names. Without sampling per theme, "reset this
 * token" and the delete-on-equal rule in the token-write path would compare
 * against the *stock* look and either restore the wrong color or keep a
 * redundant edit around forever.
 *
 * Cost: one synchronous double computed-style pass over every token. Cached per
 * theme *and visual style*, so switching back and forth is free after the first
 * visit of each; the panel calls it from a layout effect so the values are in
 * place before paint.
 */

/** Token values per theme, as they render in one visual style with no user edit
 *  in play. Which style is not recorded in the shape: the cache key carries it,
 *  and the panel only ever holds the set for the style on the document. */
export type ThemeDefaults = Record<ColorScheme, Record<string, string>>;

const THEMES: ColorScheme[] = ["dark", "light"];
const SAMPLE_STYLE_ID = "palette-lab-baseline-sample";
/** The visual-style axis. Both samplers below stage it: it re-seats hundreds of
 *  `--theme-*` tokens, so neither a baseline nor an export means anything
 *  without naming which style it was read in. */
const STYLE_ATTRIBUTE = "data-visual-style";

const cache = new Map<string, ThemeDefaults>();

function emptyDefaults(): ThemeDefaults {
  return { dark: {}, light: {} };
}

/**
 * Put one attribute back exactly as it was found, where `null` means "was not
 * there" and has to stay not there: for the accent the absence *is* a value (the
 * default accent has no block to name), so writing an empty string back would
 * put the reader on an accent they never chose.
 */
function restoreAttribute(root: HTMLElement, name: string, previous: string | null): void {
  if (previous === null) root.removeAttribute(name);
  else root.setAttribute(name, previous);
}

/**
 * Read both themes' token values in one visual style, with `base` staged and the
 * lab's own override element neutralized, then put the document back exactly as
 * it was. Everything happens inside one synchronous block, so nothing is ever
 * painted mid-sample.
 *
 * Shape of the block, and it is load-bearing: every attribute is *read* before
 * the first one is *written*, and every write lives inside the `try`. No path
 * through this function can strand an attribute — a throw out of
 * `buildOverrideCss` or `appendChild` unwinds through the same `finally` as a
 * clean pass, and the reader's page is handed back in the scheme, style, palette
 * and accent it arrived in. Do not lift a write above the `try` for tidiness;
 * that is exactly the hole, and it is the one this function used to have.
 */
function sampleDefaults(base: PaletteOverrides, visualStyle: VisualStyle): ThemeDefaults {
  const result = emptyDefaults();
  if (typeof document === "undefined") return result;

  const root = document.documentElement;
  // Reads only, and all of them, before anything is written.
  const previousTheme = root.getAttribute("data-theme");
  const previousStyle = root.getAttribute(STYLE_ATTRIBUTE);
  const previousPalette = root.getAttribute(PALETTE_ATTRIBUTE);
  const previousAccent = root.getAttribute(ACCENT_ATTRIBUTE);
  const overrideEl = document.getElementById(PALETTE_LAB_OVERRIDE_STYLE_ID);
  const overrideText = overrideEl?.textContent ?? "";
  const sample = document.createElement("style");
  sample.id = SAMPLE_STYLE_ID;

  try {
    // Four things carry the visitor's look on top of the authored stylesheet, and
    // the split between them is the whole design: three are layers the editor is
    // editing *over* and are **neutralized**; the fourth is the base the editor is
    // editing and is **held**.
    //
    // Neutralized, or the "pristine" sample comes back carrying the very values it
    // is supposed to be the baseline for. First the injected element (custom-slot
    // tokens plus edits)…
    if (overrideEl) overrideEl.textContent = "";

    // …then the palette attribute, which switches on a compiled preset block in
    // the global stylesheet. Removed rather than re-pointed: `base` below is the
    // authoritative statement of what this theme's own values are, and it must be
    // the only preset layer in play while sampling.
    root.removeAttribute(PALETTE_ATTRIBUTE);

    // …then the accent attribute, which switches on a compiled accent block in the
    // generated sheet — a Fun colourway in Fun, `--ei-*` seeds in Pro. Left in
    // place it breaks the delete-on-equal rule outright: an editor whose token
    // value happens to match the accent's would have their edit read as "same as
    // pristine" and silently dropped, when the accent is a layer they are editing
    // *over*. Removed on the same terms as the palette attribute, and for the same
    // reason — `base` is the authoritative statement of this theme's own values.
    root.removeAttribute(ACCENT_ATTRIBUTE);

    // Held, not neutralized — the mirror case, and the one it is tempting to get
    // wrong. `pro-theme.css` re-seats hundreds of `--theme-*` tokens as the *base*
    // a Pro editor is editing, not as a layer over it, so removing this attribute
    // would hand a Pro page Fun's baselines and break delete-on-equal in both
    // directions: an edit equal to the Pro value kept as a divergence it is not,
    // and an edit equal to the stale Fun value dropped even though it visibly
    // moves the Pro page. Wrong storage rather than a wrong pixel, so nothing on
    // screen reports it. Unreachable while #119's force-lock pinned this route to
    // Fun; the moment that lock came off it went live, which is why the style is
    // named in the cache key as well as staged here.
    //
    // Staged from the argument rather than read off the document because the two
    // writers fire in a fixed order the source does not show: the one appearance
    // owner writes `data-visual-style` from a *passive* effect
    // (`src/context/ThemeContext.tsx:213-228`) while the panel samples from a
    // *layout* effect (`src/features/theme-lab/PaletteLab.tsx:157-160`), and the
    // layout effect runs before the passive write. On the commit that flips the
    // cog the React value is already the new style and the attribute is still the
    // old one. Trusting the document there would file a Fun sample under the Pro
    // key and poison it for the rest of the session — worse than the bug above,
    // which at least re-samples on remount. Staging makes the sample agree with
    // the key it is filed under whichever of the two effects lands first.
    root.setAttribute(STYLE_ATTRIBUTE, visualStyle);

    // Stage this theme's own layer at the same specificity the lab renders it at.
    // The user-layer selector matches on `data-theme` alone, so stripping the
    // palette attribute above does not silence what we are staging.
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
    // `remove()` on a node that never reached the head is a no-op, so this is as
    // safe on the throwing path as on the clean one.
    sample.remove();
    restoreAttribute(root, "data-theme", previousTheme);
    restoreAttribute(root, STYLE_ATTRIBUTE, previousStyle);
    restoreAttribute(root, PALETTE_ATTRIBUTE, previousPalette);
    restoreAttribute(root, ACCENT_ATTRIBUTE, previousAccent);
    if (overrideEl) overrideEl.textContent = overrideText;
  }

  return result;
}

/**
 * Cache identity: the theme's storage key *and* the visual style it was sampled
 * in. The key alone is not enough — one theme has one baseline set per style,
 * because Pro re-seats hundreds of the tokens being sampled.
 */
function variantKey(cacheKey: string, visualStyle: VisualStyle): string {
  return `${visualStyle}:${cacheKey}`;
}

/**
 * Baselines for one theme in one visual style, cached under `cacheKey` (the
 * active theme's storage key, so shipped presets and custom slots never share an
 * entry) paired with the style.
 */
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

/**
 * Forget cached samples: one theme's when `cacheKey` is given (a deleted custom
 * slot, whose key a later slot could be handed again), otherwise all of them
 * (tests install fresh stylesheets between cases).
 *
 * A named key clears *every* style variant, not the one the caller happens to be
 * wearing. Callers name a theme, never a style — `deleteCustomThemeSlot` has no
 * opinion about Fun or Pro — so leaving the other variant behind is exactly the
 * stale entry a recycled slot id would inherit. Enumerated rather than
 * prefix-matched: a theme key can itself contain a colon (`custom:<id>`), so
 * scanning for one would be guesswork where two exact deletes are not.
 */
export function clearThemeBaselineCache(cacheKey?: string): void {
  if (cacheKey === undefined) {
    cache.clear();
    return;
  }
  for (const visualStyle of SUPPORTED_VISUAL_STYLES) {
    cache.delete(variantKey(cacheKey, visualStyle));
  }
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
 * Synchronous like its neighbour, and it writes inside the `try` and restores
 * through the same helper, so no path leaves an attribute stranded and no
 * intermediate frame is ever painted.
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
