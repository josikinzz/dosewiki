/**
 * The accent axis, reduced to its base look plus migration vocabulary.
 *
 * dose.wiki no longer ships named accent colourways: the reader-facing accent control is a
 * continuous hue slider (`--dw-accent-hue`, `src/theme/appearanceChroma.ts`) composed with the
 * saturation slider, both derived from the one authored base accent — Default, plum/fuchsia at
 * `--h-brand: 326`. Grey is saturation level 0 on the chroma axis, not a colourway.
 *
 * Two things still have to be authored rather than derived, and they live here:
 *
 * - **The base Pro seeds.** Fun's authored palette IS the default accent, so its Fun half
 *   emits nothing. Pro's authored `--ei-*` seeds are Effect Index's teal, though — that sheet
 *   is Effect Index's presentation, shared with dose.wiki's Pro style — so without a block of
 *   its own, dose.wiki's Pro wears another publication's colour while its Fun wears plum.
 *   {@link BASE_ACCENT_PRO_SEEDS} is therefore Pro's ramp rotated to Orchid's 326, emitted by
 *   `accentStylesheet.ts` under `html[data-visual-style="pro"]:not([data-accent])[data-theme]`.
 *   Effect Index keeps the authored teal byte for byte because it never imports that sheet
 *   (`src/app/_styles/effectindex.ts` imports `styles.css` and `pro-theme.css`, nothing else).
 *
 * - **The migration table.** {@link LEGACY_ACCENT_TO_HUE} carries a reader's old
 *   `dosewiki-accent` choice onto the hue/chroma axes. Each shift is the retired colourway's
 *   authored `--h-brand` minus the base's 326, normalised to 0..359 — frozen history,
 *   hard-coded so the migration cannot drift when the Theme Lab's preset payloads move on.
 *   `accents.test.ts` pins them against the authored seeds.
 */

/** Ids the retired `dosewiki-accent` storage key could hold. Migration vocabulary only. */
export type AccentId = "default" | "blue" | "green" | "red" | "amber" | "neutral" | "teal";

/** One colour scheme's worth of Pro accent seeds. Keys are `--ei-*` custom property names. */
export type ProAccentSeeds = Readonly<Record<string, string>>;

export const BASE_ACCENT_ID: AccentId = "default";

/**
 * The nine Pro seeds the accent owns, derived from the authored declarations in
 * `pro-theme.css` rather than assumed: the four-step accent ramp, the on-charcoal step, the
 * three tinted washes, and the ink that sits on a filled accent.
 *
 * `--ei-fade` is deliberately absent. It sits in the same comment block as the washes but
 * is not accent: it is the paper canvas at 88% alpha (the scrim that fades a collapsed dose
 * table into the page). Re-tinting it would tint paper, not the accent.
 *
 * `--ei-accent-on-dark` is declared ONCE in `pro-theme.css` (`:134`), and that one declaration
 * is already scheme-independent: its selector list (`:72-74`) includes
 * `html[data-visual-style="pro"][data-theme="dark"]`. The base accent's blocks are NOT — each
 * half is keyed `[data-theme="light"]` or `[data-theme="dark"]` — so a light-half-only
 * restatement cannot match a dark page and the authored teal goes on winning there. Measured
 * before this was corrected: `--ei-accent` resolved to the reader's accent while
 * `--ei-accent-on-dark` still resolved to teal `#6fc4bb`. The chrome rails are the consumer
 * that proves it: `.app-header` (`pro-theme.css:1304-1307`) and `.app-footer` (`:1466-1469`)
 * resolve their whole four-member `--theme-accent` family through it — three bare `var()`s and
 * a `color-mix(… 83%, #000000)` for the muted step — as do both wordmark gradients
 * (`:1317-1319`, `:1478-1480`), under selectors carrying no `data-theme`. So Pro in dark
 * rendered a teal wordmark, teal nav icons and a teal magnifier over a plum page. Both halves
 * therefore state it at the SAME value: the rails are charcoal in either scheme, so "the
 * accent as it appears on a dark bar" has one value, not two. `proTheme.test.ts:381` enforces
 * the same invariant from the CSS side — inside the rails this is the ONLY accent seed a
 * declaration may resolve, precisely because it is the only one that does not vary by scheme.
 *
 * The two guards are not redundant, and neither subsumes the other: that one goes red when a
 * rail declaration reads a per-scheme seed, but never opens this file, so it cannot see whether
 * the seed it permits is populated; `accents.test.ts` goes red when this seed stops carrying
 * the accent in the dark half, but cannot see a rail that bypassed the seed entirely. Drop
 * either and the leak returns through the gap the survivor does not cover.
 */
export const PRO_ACCENT_SEED_NAMES = {
  light: [
    "--ei-accent",
    "--ei-accent-strong",
    "--ei-accent-soft",
    "--ei-accent-muted",
    "--ei-accent-on-dark",
    "--ei-selection",
    "--ei-ring-soft",
    "--ei-highlight",
    "--ei-on-accent",
  ],
  dark: [
    "--ei-accent",
    "--ei-accent-strong",
    "--ei-accent-soft",
    "--ei-accent-muted",
    "--ei-accent-on-dark",
    "--ei-selection",
    "--ei-ring-soft",
    "--ei-highlight",
    "--ei-on-accent",
  ],
} as const;

/**
 * The base accent's swatch — the measured Fun-dark `--theme-accent`: `#f0abfc`, the light
 * fuchsia, NOT the `#d946ef` mid-fuchsia of the brand seed. Anything advertising the accent
 * (the hue slider's zero-shift end, previews) has to show the colour the reader will actually
 * see, or it advertises a page nobody renders.
 */
export const BASE_ACCENT_SWATCH = "#f0abfc";

/**
 * The base accent's Pro halves — dose.wiki's own plum on Pro, derived not authored-teal.
 *
 * Pro's ramp rotated to Orchid's own 326, exactly as the retired accent rows were rotated to
 * their colourways' brands: measured at hue 326.7 light and 325.7 dark, at Pro's chroma.
 *
 * Both floors bind, in both schemes, and both margins are the narrowest the derivation
 * produced — recorded because they are what a future chroma or budget change breaks first:
 *
 * - **Light: 4.5034:1 on paper `#f6f5f1`, against the 4.5 floor.** A pure rotation of the
 *   authored light ramp to 326 measures 3.4016:1, and the authored teal it starts from measures
 *   3.12:1 — a breach that predated this axis. `accent`, `soft` and `muted` take a uniform ΔL
 *   of −0.068, the least that lifts the base seed over the floor. `strong` is exempt: carried
 *   along it landed at 9.05:1 and read as near-black on section heads, the H1 and the wordmark,
 *   so it sits at ΔL +0.06 from that value instead, `#684968` at 7.01:1 (AAA) with the hue
 *   still visible. Ink-on-fill measures 7.54:1.
 * - **Dark: 7.41:1 base and 9.2160:1 strong on `--ei-surface-raised` `#212121`, against Pro's
 *   own stated 7.4 / 9.2 budgets.** A pure rotation lands the base at 7.3475:1 — under budget —
 *   so the dark ramp takes ΔL of +0.002, about one 8-bit step, exactly as far as the budget
 *   asks. `strong` is the pure rotation untouched, and it clears its 9.2 budget by 0.02. Plum
 *   at hue 326 carries less luminance per unit lightness than the authored teal, so nothing
 *   here is slack. Ink-on-fill measures 9.86:1, and the base step 8.55:1 against the dark
 *   canvas.
 *
 * `--ei-accent-on-dark` is `#cfa0cf` in BOTH halves: the chrome rails are charcoal in either
 * scheme, so "the accent as it appears on a dark bar" has one value. It is the pure rotation,
 * unlifted — it sits on a rail rather than on the raised surface Pro's budgets were authored
 * against, so neither budget reaches it.
 */
export const BASE_ACCENT_PRO_SEEDS: { readonly light: ProAccentSeeds; readonly dark: ProAccentSeeds } = {
  light: {
    "--ei-accent": "#8f618f",
    "--ei-accent-strong": "#684968",
    "--ei-accent-soft": "#a87ba9",
    "--ei-accent-muted": "#785178",
    "--ei-accent-on-dark": "#cfa0cf",
    "--ei-selection": "#e9d9e8",
    "--ei-ring-soft": "#d4b7d4",
    "--ei-highlight": "#e9dfe9",
    "--ei-on-accent": "#ffffff",
  },
  dark: {
    "--ei-accent": "#cfa1d0",
    "--ei-accent-strong": "#e0b7e0",
    "--ei-accent-soft": "#a67da7",
    "--ei-accent-muted": "#b589b5",
    "--ei-accent-on-dark": "#cfa0cf",
    "--ei-selection": "#534153",
    "--ei-ring-soft": "#926f92",
    "--ei-highlight": "#574557",
    "--ei-on-accent": "#1b1b1b",
  },
};

export function isAccent(value: string | null | undefined): value is AccentId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(LEGACY_ACCENT_TO_HUE, value)
  );
}

/**
 * Where a saved accent id lands on the new axes: the retired row's brand hue as a rotation
 * from the base, plus a chroma pin for the one achromatic row. Each retired accent wore a Fun
 * colourway cut at one `--h-brand`, so its heir is that angle minus Orchid's 326. Neutral was
 * never a hue — it wore Graphite, the near-zero-chroma colourway — so its heir is saturation
 * level 0, not a rotation; `chroma: 0` overrides any stored chroma level during migration.
 */
export const LEGACY_ACCENT_TO_HUE: Record<AccentId, { hue: number; chroma?: 0 }> = {
  default: { hue: 0 },
  blue: { hue: 249 }, // wore Abyss: authored --h-brand 215 − base 326, mod 360
  green: { hue: 184 }, // Canopy: 150 − 326
  red: { hue: 59 }, // Garnet: 25 − 326
  amber: { hue: 79 }, // Sunset: 45 − 326
  neutral: { hue: 0, chroma: 0 }, // wore Graphite: grey is chroma 0 now, not a hue
  teal: { hue: 221 }, // Lagoon: 187 − 326
};
