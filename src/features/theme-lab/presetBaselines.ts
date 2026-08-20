import type { ColorScheme, VisualStyle } from "@/theme";
import {
  THEME_LAB_OVERRIDE_STYLE_ID,
  buildOverrideCss,
  type PaletteOverrides,
} from "./themeLabStorage";
import { ALL_TOKEN_IDS } from "./paletteTokens";

/**
 * Revert baselines: *the value a token has in this colour scheme, on the look
 * being worn, when the visitor has not touched it*.
 *
 * This has to be sampled rather than looked up, because most of the palette
 * derives from a handful of seeds — a surface that re-seats `--c-brand` changes
 * hundreds of tokens it never names. Without sampling, "reset this token" and the
 * delete-on-equal rule in the token-write path would compare against the *stock*
 * look and either restore the wrong color or keep a redundant edit around
 * forever.
 *
 * Cost: one synchronous double computed-style pass over every token. Cached per
 * look *and visual style*, so switching back and forth is free after the first
 * visit of each; the panel calls it from a layout effect so the values are in
 * place before paint.
 */

/** Token values per theme, as they render in one visual style with no user edit
 *  in play. Which style is not recorded in the shape: the cache key carries it,
 *  and the panel only ever holds the set for the style on the document. */
export type ThemeDefaults = Record<ColorScheme, Record<string, string>>;

const THEMES: ColorScheme[] = ["dark", "light"];
const SAMPLE_STYLE_ID = "theme-lab-baseline-sample";
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
 * there" and has to stay not there: a bare test render carries no visual style,
 * and writing an empty string back would invent one the reader never had.
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
 * clean pass, and the reader's page is handed back in the scheme and style it
 * arrived in. Do not lift a write above the `try` for tidiness;
 * that is exactly the hole, and it is the one this function used to have.
 */
function sampleDefaults(base: PaletteOverrides, visualStyle: VisualStyle): ThemeDefaults {
  const result = emptyDefaults();
  if (typeof document === "undefined") return result;

  const root = document.documentElement;
  // Reads only, and all of them, before anything is written.
  const previousTheme = root.getAttribute("data-theme");
  const previousStyle = root.getAttribute(STYLE_ATTRIBUTE);
  const overrideEl = document.getElementById(THEME_LAB_OVERRIDE_STYLE_ID);
  const overrideText = overrideEl?.textContent ?? "";
  const sample = document.createElement("style");
  sample.id = SAMPLE_STYLE_ID;

  try {
    // Three things carry the reader's look on top of the authored stylesheet,
    // and the split between them is the whole design: one is a layer the editor
    // is editing *over* and is **neutralized**; the other two are the base the
    // editor is editing and are **held** — one staged from the argument, one
    // simply never touched.
    //
    // Neutralized, or the "pristine" sample comes back carrying the very values
    // it is supposed to be the baseline for: the injected element, which holds
    // the visitor's own edits on the look being sampled.
    if (overrideEl) overrideEl.textContent = "";

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
    // (`src/context/ThemeContext.tsx`) while the panel samples from a
    // *layout* effect (`src/features/theme-lab/ThemeLab.tsx`), and the
    // layout effect runs before the passive write. On the commit that flips the
    // cog the React value is already the new style and the attribute is still the
    // old one. Trusting the document there would file a Fun sample under the Pro
    // key and poison it for the rest of the session — worse than the bug above,
    // which at least re-samples on remount. Staging makes the sample agree with
    // the key it is filed under whichever of the two effects lands first.
    //
    // The hue and saturation axes are held on the same terms, which is why they
    // are absent from this function entirely: the reader's `--dw-*` properties
    // and the chroma attribute rotate the palette these baselines are the
    // baseline of, so stripping them would make every reset restore the base
    // position's colour instead of the one the reader is on.
    root.setAttribute(STYLE_ATTRIBUTE, visualStyle);

    // Stage the caller's own layer at the same specificity the lab renders it at.
    // The user-layer selector matches on `data-theme` alone.
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
    if (overrideEl) overrideEl.textContent = overrideText;
  }

  return result;
}

/**
 * Cache identity: the look the sample was taken on *and* the visual style it was
 * taken in. The style is named separately rather than trusted to arrive inside
 * `cacheKey`, because {@link sampleDefaults} stages the style it is *told* — the
 * document may still carry the previous one for a commit — and the value staged
 * has to be the value the entry is filed under.
 */
function variantKey(cacheKey: string, visualStyle: VisualStyle): string {
  return `${visualStyle}:${cacheKey}`;
}

/**
 * Baselines for one look in one visual style, cached under `cacheKey` (the
 * caller's look key, so no two looks share an entry) paired with the style.
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
 * Forget every cached sample.
 *
 * A test seam, and only that: nothing in the app invalidates baselines, because a
 * look's pristine values come from stylesheets the build shipped and cannot move
 * while the page is alive. Tests install their own fixture stylesheets between
 * cases, which is exactly the one thing that *can* move them.
 */
export function clearThemeBaselineCache(): void {
  cache.clear();
}

/**
 * Read tokens exactly as they render in one appearance combination, with
 * everything that paints the visitor's look left in place.
 *
 * The mirror image of the baseline sampler above: nothing is neutralized,
 * because an export wants the *rendered* value — the reader's hue and
 * saturation rotation and the editor's own edits included. It exists because an
 * accent's shape spans combinations the editor is not currently wearing: the
 * Pro seeds cannot be read off a Fun page, and the measured swatch is the
 * Fun-dark `--theme-accent` however the editor happens to be viewing it.
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
