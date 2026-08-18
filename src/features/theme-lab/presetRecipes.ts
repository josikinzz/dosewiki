import type { PresetOverrides, ThemeOverrideMap } from "./palettePresets";

/**
 * The recipes every alternate colourway is authored with.
 *
 * They live in their own module because the colourways do. `palettePresets.ts`
 * kept them beside twelve preset declarations until that file measured 889 lines
 * against its reviewed 925-line cleanup budget; once the colourways moved out,
 * the recipes had three callers — `presetAccentColourways.ts`,
 * `presetLabColourways.ts`, and `journalPreset.ts`.
 *
 * The alternative was a local copy per colourway module, which is the shape
 * `journalPreset.ts` used while there was nowhere shared to put `split`. It is
 * rejected for the scrollbar recipes in particular: each returns a single
 * ~800-character gradient literal whose whole purpose is to mirror one stock
 * recipe, and `palette-presets.generated.css` is byte-compared in CI, so a copy
 * that drifted would silently rewrite the checked-in stylesheet for half the
 * palettes. `split` follows them rather than staying duplicated a third time.
 */

/** Shared entries land in both themes; theme maps win on conflicts. */
export function split(
  shared: ThemeOverrideMap,
  dark: ThemeOverrideMap,
  light: ThemeOverrideMap,
): PresetOverrides {
  return { dark: { ...shared, ...dark }, light: { ...shared, ...light } };
}

/**
 * The authored scrollbar thumb gradients hard-code fuchsia oklch stops, so
 * every alternate palette re-derives them from its own hue. Mirrors the
 * stock recipes (frosted pill in a channel, highlight at 12% 0%), scaled to
 * the preset's chroma.
 */
export function scrollThumbOverrides(hue: number, chroma: number): ThemeOverrideMap {
  const c = (scale: number) => (chroma * scale).toFixed(3);
  return {
    "--theme-scroll-thumb-bg": `radial-gradient(circle at 12% 0%, color-mix(in srgb, oklch(76% ${c(1)} ${hue}) 66%, var(--theme-scroll-track)), color-mix(in srgb, oklch(62% ${c(1.3)} ${hue}) 50%, var(--theme-scroll-track)) 42%), linear-gradient(135deg, color-mix(in srgb, oklch(62% ${c(1.3)} ${hue}) 50%, var(--theme-scroll-track)), color-mix(in srgb, oklch(50% ${c(1.1)} ${hue}) 40%, var(--theme-scroll-track)))`,
    "--theme-scroll-thumb-hover-bg": `radial-gradient(circle at 12% 0%, color-mix(in srgb, oklch(82% ${c(0.9)} ${hue}) 82%, var(--theme-scroll-track)), color-mix(in srgb, oklch(68% ${c(1.35)} ${hue}) 64%, var(--theme-scroll-track)) 42%), linear-gradient(135deg, color-mix(in srgb, oklch(68% ${c(1.35)} ${hue}) 64%, var(--theme-scroll-track)), color-mix(in srgb, oklch(56% ${c(1.2)} ${hue}) 52%, var(--theme-scroll-track)))`,
  };
}

export function scrollThumbOverridesLight(hue: number, chroma: number): ThemeOverrideMap {
  const c = chroma.toFixed(3);
  return {
    "--theme-scroll-thumb-bg": `radial-gradient(circle at 12% 0%, color-mix(in srgb, oklch(72% ${c} ${hue}) 64%, var(--theme-scroll-track)), color-mix(in srgb, oklch(54% ${c} ${hue}) 50%, var(--theme-scroll-track)) 42%), linear-gradient(135deg, color-mix(in srgb, oklch(54% ${c} ${hue}) 50%, var(--theme-scroll-track)), color-mix(in srgb, oklch(46% ${c} ${hue}) 42%, var(--theme-scroll-track)))`,
    "--theme-scroll-thumb-hover-bg": `radial-gradient(circle at 12% 0%, color-mix(in srgb, oklch(76% ${c} ${hue}) 78%, var(--theme-scroll-track)), color-mix(in srgb, oklch(50% ${c} ${hue}) 64%, var(--theme-scroll-track)) 42%), linear-gradient(135deg, color-mix(in srgb, oklch(50% ${c} ${hue}) 64%, var(--theme-scroll-track)), color-mix(in srgb, oklch(42% ${c} ${hue}) 54%, var(--theme-scroll-track)))`,
  };
}

/**
 * The one dark token the dark-mode retune left as a hand-tuned literal in
 * site-colors.css because its hue sits off the seed family it belongs to (the
 * page-gradient top stop lands at hue 307 vs `--h-plum` 318), so re-deriving
 * it from the seed would visibly shift the shipped Orchid look. Every
 * alternate palette therefore re-derives it at the same lightness/chroma from
 * its own seed, or it inherits Orchid's purple page gradient.
 *
 * The active-tab fill used to live here too. It no longer does: the base
 * sheet now authors `--theme-route-active-base` as
 * `oklch(35.7% 0.112 var(--h-violet))` itself, so restating it per preset
 * would be a byte-for-byte duplicate.
 */
export const retunedDarkLiterals: ThemeOverrideMap = {
  "--theme-page-start": "oklch(45% 0.231 var(--h-plum))",
};
