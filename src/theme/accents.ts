import type { PalettePresetId } from "@/features/theme-lab/palettePresets";

/**
 * The accent axis: the third appearance axis, alongside colour scheme (`data-theme`) and
 * visual style (`data-visual-style`).
 *
 * An accent is one hue worn across BOTH visual styles. Fun and Pro express colour through
 * two unrelated token systems — Fun seeds hue angles and channel scales, Pro seeds a small
 * `--ei-*` palette — so an accent carries one half for each: the shipped colourway Fun
 * wears, and the `--ei-*` seeds Pro wears. What makes it one accent rather than two is the
 * hue angle: both halves are cut from the colourway's own `--h-brand`, so a reader who picks
 * Blue and then switches style sees the same colour in a different vocabulary.
 *
 * The root attribute is `data-accent`, and **its absence means the default accent** — the
 * bootstrap removes the attribute rather than writing `"default"`, so nothing in this axis
 * needs a runtime and no first paint waits on a style recalculation.
 *
 * The default is not the accent that emits nothing, though; it is the accent that is keyed by
 * an absence. Its Fun half genuinely emits nothing, because Fun's authored palette IS the
 * default (Orchid, plum/fuchsia at `--h-brand: 326`). Its Pro half has to emit, because Pro's
 * authored `--ei-*` seeds are Effect Index's teal: unblocked, dose.wiki's Pro wore another
 * publication's colour while its Fun wore plum. So the generator emits the default's Pro seeds
 * under `html[data-visual-style="pro"]:not([data-accent])[data-theme="…"]`, and Effect Index
 * keeps the authored teal byte for byte because it never imports that stylesheet at all
 * (`src/app/_styles/effectindex.ts` imports `styles.css` and `pro-theme.css`, nothing else).
 *
 * These definitions are the single source of truth. The stylesheet that carries them into
 * the browser is emitted from {@link buildAccentStylesheetCss} by
 * `npm run generate:accent-css`, and `accents.axis.test.ts` fails if the checked-in file drifts.
 */

export type AccentId = "default" | "blue" | "green" | "red" | "amber" | "neutral" | "teal";

/** One colour scheme's worth of Pro accent seeds. Keys are `--ei-*` custom property names. */
export type ProAccentSeeds = Readonly<Record<string, string>>;

export type Accent = {
  readonly id: AccentId;
  /** Reader-facing label in the cog. */
  readonly label: string;
  /** The cog's swatch dot. One value for both schemes and both styles. */
  readonly swatch: string;
  /** Fun half: the shipped colourway this accent wears. `null` = the authored base palette. */
  readonly funPresetId: PalettePresetId | null;
  /** Pro half: per-scheme `--ei-*` seeds. `null` = the authored teal in `pro-theme.css`. */
  readonly pro: { readonly light: ProAccentSeeds; readonly dark: ProAccentSeeds } | null;
};

export const DEFAULT_ACCENT_ID: AccentId = "default";

/**
 * The nine Pro seeds an accent owns, derived from the authored declarations in
 * `pro-theme.css` rather than assumed: the four-step accent ramp, the on-charcoal step, the
 * three tinted washes, and the ink that sits on a filled accent.
 *
 * `--ei-fade` and `--ei-logo-ink` are deliberately absent. Both sit in the same comment
 * block as the washes and neither is accent: `--ei-fade` is the paper canvas at 88% alpha
 * (the scrim that fades a collapsed dose table into the page) and `--ei-logo-ink` is the
 * wordmark's ink end. Re-tinting either would tint paper or ink, not the accent.
 *
 * `--ei-accent-on-dark` is declared ONCE in `pro-theme.css` (`:134`), and that one declaration
 * is already scheme-independent: its selector list (`:72-74`) includes
 * `html[data-visual-style="pro"][data-theme="dark"]`. An accent's blocks are NOT — each half is
 * keyed `[data-theme="light"]` or `[data-theme="dark"]` — so a light-half-only restatement
 * cannot match a dark page and the authored teal goes on winning there. Measured on
 * `{pro, dark, accent:blue}` before this was corrected: `--ei-accent` resolved to Blue's
 * `#6fc0d4` while `--ei-accent-on-dark` still resolved to teal `#6fc4bb`. The chrome rails are
 * the consumer that proves it: `.app-header` (`pro-theme.css:1304-1307`) and `.app-footer`
 * (`:1466-1469`) resolve their whole four-member `--theme-accent` family through it — three bare
 * `var()`s and a `color-mix(… 83%, #000000)` for the muted step — as do both wordmark gradients
 * (`:1317-1319`, `:1478-1480`), under selectors carrying no `data-theme`. So Pro in dark rendered
 * a teal wordmark, teal nav icons and a teal magnifier over a blue page. Every accent therefore
 * states it in BOTH halves at the SAME value: the rails are charcoal in either scheme, so "the
 * accent as it appears on a dark bar" has one value per accent, not two. `proTheme.test.ts:381`
 * enforces the same invariant from the CSS side — inside the rails this is the ONLY accent seed a
 * declaration may resolve, precisely because it is the only one that does not vary by scheme.
 *
 * The two guards are not redundant, and neither subsumes the other: that one goes red when a rail
 * declaration reads a per-scheme seed, but never opens this file, so it cannot see whether the
 * seed it permits is populated; `accents.axis.test.ts` goes red when this seed stops carrying the
 * reader's accent in the dark half, but cannot see a rail that bypassed the seed entirely. Drop
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
 * Default — the authored look on Fun, and dose.wiki's own plum on Pro.
 *
 * Fun renders `site-colors.css` as written, so this half is `null`: Orchid's plum/fuchsia at
 * `--h-brand: 326` is the publication's opening appearance and there is nothing to override.
 * The swatch is the measured Fun-dark `--theme-accent`: `#f0abfc`, the light fuchsia, NOT the
 * `#d946ef` mid-fuchsia of the brand seed. The dot has to be the colour the reader will
 * actually see, or it advertises a page nobody renders.
 *
 * Pro cannot be `null`, and that is the asymmetry worth naming. `pro-theme.css` seeds
 * `--ei-accent: #3d9991` in light and `#6fc4bb` in dark — Effect Index's teal, because that
 * sheet is Effect Index's presentation, shared with dose.wiki's Pro style. With no block here a
 * dose.wiki reader who switched to Pro left the publication's own colour behind and arrived in
 * another publication's identity, while their Fun half stayed plum. So the default's Pro half
 * is Pro's ramp rotated to Orchid's own 326, exactly as every other accent is rotated to its
 * colourway's brand: measured at hue 326.7 light and 325.7 dark, at Pro's chroma. Effect Index
 * is unaffected because it never imports `accent-tokens.generated.css` at all.
 *
 * Both floors bind, in both schemes, and both margins are the narrowest in the table — recorded
 * here for the same reason Amber's 7.42/9.23 is recorded below, because they are what a future
 * chroma or budget change breaks first:
 *
 * - **Light: 4.5034:1 on paper `#f6f5f1`, against the 4.5 floor.** A pure rotation of the
 *   authored light ramp to 326 measures 3.4016:1, and the authored teal it starts from measures
 *   3.12:1 — a breach that predated this axis and was, until this accent existed, a named
 *   exemption in `accents.contrast.test.ts` worn by `default/pro/light` itself. The ramp takes a
 *   uniform ΔL of −0.068 across `accent`, `strong`, `soft` and `muted`, the least that lifts the
 *   base seed over the floor, applied uniformly so every authored gap survives rather than the
 *   base sliding past `muted`. `strong` then measures 9.05:1 and ink-on-fill 9.87:1.
 * - **Dark: 7.41:1 base and 9.2160:1 strong on `--ei-surface-raised` `#212121`, against Pro's
 *   own stated 7.4 / 9.2 budgets.** A pure rotation lands the base at 7.3475:1 — under budget,
 *   the way Red's is — so the dark ramp takes ΔL of +0.002, about one 8-bit step, exactly as far
 *   as the budget asks. `strong` is the pure rotation untouched, and **it clears its 9.2 budget
 *   by 0.02, the tightest margin in the whole set** (Amber's is 0.03, Red's 0.10). Plum at hue
 *   326 carries less luminance per unit lightness than the authored teal, so nothing here is
 *   slack. Ink-on-fill measures 9.86:1, and the base step 8.55:1 against the dark canvas.
 *
 * `--ei-accent-on-dark` is `#cfa0cf` in BOTH halves, like every other accent: the chrome rails
 * are charcoal in either scheme, so "the accent as it appears on a dark bar" has one value. It
 * is the pure rotation, unlifted — it sits on a rail rather than on the raised surface Pro's
 * budgets were authored against, so neither budget reaches it.
 */
const defaultAccent: Accent = {
  id: "default",
  label: "Default",
  swatch: "#f0abfc",
  funPresetId: null,
  pro: {
    light: {
      "--ei-accent": "#8f618f",
      "--ei-accent-strong": "#573957",
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
  },
};

/**
 * Blue — Abyss on Fun, and a hue-rotated Pro palette at Abyss's own `--h-brand` of 215.
 *
 * One hue angle for both halves is what makes this one accent: rotating Pro's teal ramp to
 * the angle the Fun colourway already seeds means Blue reads as the same colour through two
 * different vocabularies. Chroma is Pro's, unchanged — Pro is a paper skin and Fun's cyan
 * chroma would be loud on it.
 *
 * Lightness is Pro's too, with ONE deliberate exception. Pro authors a darker ramp in light
 * than in dark on purpose (a link has to darken against paper and lighten against a dark
 * canvas), so neither scheme is derived from the other and the dark half here is a pure hue
 * rotation: it already measures 7.80:1 base and 9.67:1 strong against `--ei-surface-raised`,
 * clearing Pro's own stated 7.4 / 9.2 budgets.
 *
 * The light half cannot be. The authored teal `--ei-accent` measures 3.12:1 against paper —
 * below the 4.5:1 floor, a breach that predates this axis — and a pure rotation to 215
 * measures 3.17:1, so the floor forces the ramp darker. It is shifted by a single
 * ΔL of −0.092, the least that lifts `--ei-accent` to 4.63:1, and the same shift is applied
 * to `soft`, `muted` and `strong` so every authored gap in the ramp survives intact rather
 * than the base seed sliding past `muted` and inverting the family. Rotating the hue instead
 * buys nothing: across the whole ±15° tolerance the ratio moves from 3.13:1 to 3.19:1.
 *
 * The washes (`--ei-selection`, `--ei-ring-soft`, `--ei-highlight`) and the on-charcoal step
 * are pure rotations: no floor reaches them because none of them carries text, and the ink
 * over each still clears 7:1. `--ei-on-accent` is ink ON the fill, so it follows the fill's
 * lightness rather than the accent's hue — white over a dark light-scheme fill, near-black
 * over a light dark-scheme fill, which is where the authored teal already put it.
 */
const blue: Accent = {
  id: "blue",
  label: "Blue",
  swatch: "#a5f3fc",
  funPresetId: "abyss",
  pro: {
    light: {
      "--ei-accent": "#1a798c",
      "--ei-accent-strong": "#054753",
      "--ei-accent-soft": "#3e93a6",
      "--ei-accent-muted": "#116575",
      "--ei-accent-on-dark": "#6fc0d4",
      "--ei-selection": "#cde4ea",
      "--ei-ring-soft": "#9ecbd6",
      "--ei-highlight": "#d7e6ea",
      "--ei-on-accent": "#ffffff",
    },
    dark: {
      "--ei-accent": "#6fc0d4",
      "--ei-accent-strong": "#8fd3e4",
      "--ei-accent-soft": "#4f99aa",
      "--ei-accent-muted": "#59a7b9",
      "--ei-accent-on-dark": "#6fc0d4",
      "--ei-selection": "#2f4e55",
      "--ei-ring-soft": "#4a8796",
      "--ei-highlight": "#335259",
      "--ei-on-accent": "#1b1b1b",
    },
  },
};

/**
 * Green — Canopy on Fun, and Pro's ramp rotated to Canopy's own `--h-brand` of 150.
 *
 * The dark half is a pure rotation. It measures 7.88:1 base and 9.68:1 strong against
 * `--ei-surface-raised`, the widest margin in the set over Pro's 7.4 / 9.2 budgets, because
 * green at Pro's chroma carries more luminance per unit lightness than the authored teal.
 *
 * The light half needs the floor shift, like Blue's: a pure rotation to 150 measures 3.14:1
 * against paper. ΔL of −0.088 is the least that lifts `--ei-accent` to 4.51:1, applied
 * uniformly across `accent`, `strong`, `soft` and `muted` so the authored gaps survive and the
 * base does not slide past `muted`.
 *
 * Safety adjacency is real here and Canopy already answers it: success green is authored at
 * `--h-green: 160`, ten degrees off this brand, so Canopy re-seats it to 185 (emerald to teal).
 * That leaves 35° between a leaf-green link and a "safe" callout. `accents.immunity.test.ts`
 * measures that separation rather than trusting it.
 */
const green: Accent = {
  id: "green",
  label: "Green",
  swatch: "#bbf7d0",
  funPresetId: "canopy",
  pro: {
    light: {
      "--ei-accent": "#467c53",
      "--ei-accent-strong": "#25492e",
      "--ei-accent-soft": "#60956b",
      "--ei-accent-muted": "#396744",
      "--ei-accent-on-dark": "#8cc296",
      "--ei-selection": "#d4e4d6",
      "--ei-ring-soft": "#acccb1",
      "--ei-highlight": "#dbe6dd",
      "--ei-on-accent": "#ffffff",
    },
    dark: {
      "--ei-accent": "#8cc296",
      "--ei-accent-strong": "#a5d4ae",
      "--ei-accent-soft": "#6a9a73",
      "--ei-accent-muted": "#75a87f",
      "--ei-accent-on-dark": "#8cc296",
      "--ei-selection": "#394e3d",
      "--ei-ring-soft": "#608868",
      "--ei-highlight": "#3d5241",
      "--ei-on-accent": "#1b1b1b",
    },
  },
};

/**
 * Red — Garnet on Fun, and Pro's ramp rotated to Garnet's own `--h-brand` of 25.
 *
 * The only accent in the set where a floor binds in BOTH schemes. Red at hue 25 is the least
 * luminous direction Pro's chroma can point, so a pure rotation lands at 7.36:1 base and
 * 9.20:1 strong on `--ei-surface-raised` — the base misses Pro's 7.4 budget by 0.04 and the
 * strong ties its 9.2 exactly. A tie is not a clearance, so the dark ramp takes a ΔL of
 * +0.003: the least that puts both on the safe side, at 7.45:1 and 9.30:1. It is a shift of
 * roughly one 8-bit step, which is the point — the derivation moves as far as the floor asks
 * and no further.
 *
 * The light half takes ΔL of −0.070 to lift `--ei-accent` from 3.39:1 to 4.54:1 on paper, the
 * smallest light shift in the set. Both shifts run uniformly across the four-step ramp.
 *
 * Danger rose is the hue this accent sits beside, and Garnet already re-seats it: authored
 * `--h-rose: 14` is eleven degrees from this brand, so Garnet moves rose to 350 and re-pins the
 * two danger literals that do not follow the seed (`DANGER_RETINT` in
 * `palettePresets.test.ts`). Red inherits that map, so it inherits the exemption — restated as a
 * named exemption in `accents.immunity.test.ts` rather than passing silently. The separation it
 * buys is 35°.
 */
const red: Accent = {
  id: "red",
  label: "Red",
  swatch: "#fca5a5",
  funPresetId: "garnet",
  pro: {
    light: {
      "--ei-accent": "#a05e59",
      "--ei-accent-strong": "#623733",
      "--ei-accent-soft": "#bb7772",
      "--ei-accent-muted": "#874e4a",
      "--ei-accent-on-dark": "#e49f98",
      "--ei-selection": "#f0d9d6",
      "--ei-ring-soft": "#e1b6b2",
      "--ei-highlight": "#efdfdd",
      "--ei-on-accent": "#ffffff",
    },
    dark: {
      "--ei-accent": "#e49f98",
      "--ei-accent-strong": "#f3b6b0",
      "--ei-accent-soft": "#b87b75",
      "--ei-accent-muted": "#c88781",
      "--ei-accent-on-dark": "#e49f98",
      "--ei-selection": "#5b403e",
      "--ei-ring-soft": "#a16d69",
      "--ei-highlight": "#5f4441",
      "--ei-on-accent": "#1b1b1b",
    },
  },
};

/**
 * Amber — Sunset on Fun, and Pro's ramp rotated to Sunset's own `--h-brand` of 45.
 *
 * The dark half is a pure rotation and clears Pro's budgets by the thinnest margin in the set:
 * 7.42:1 against a 7.4 budget and 9.23:1 against a 9.2 one. Nothing binds, so nothing moves —
 * amber at hue 45 happens to carry almost exactly the authored teal's luminance. The margin is
 * recorded here because it is the value a future chroma or budget change would break first.
 *
 * The light half takes ΔL of −0.071 to lift `--ei-accent` from 3.36:1 to 4.51:1 on paper,
 * uniform across the four-step ramp.
 *
 * This is the accent nearest the harm-reduction palette: authored `--h-orange: 48` (unsafe) is
 * three degrees away and `--h-gold: 68` (caution) twenty-three. Sunset already widens both, and
 * it widens them in opposite directions — caution gold re-seats to 95 and its one hand-tuned
 * literal moves with it (`CAUTION_GOLD`), while unsafe deepens to a burnt vermilion at 35. So
 * the shipped separations Amber inherits are 50° to caution and 10° to unsafe, and the 10° is
 * carried further by a much deeper value. `accents.immunity.test.ts` measures both and names
 * the inherited exemption.
 */
const amber: Accent = {
  id: "amber",
  label: "Amber",
  swatch: "#fdc38f",
  funPresetId: "sunset",
  pro: {
    light: {
      "--ei-accent": "#9d6247",
      "--ei-accent-strong": "#603927",
      "--ei-accent-soft": "#b87b60",
      "--ei-accent-muted": "#84513a",
      "--ei-accent-on-dark": "#e0a286",
      "--ei-selection": "#efdad1",
      "--ei-ring-soft": "#dfb9a8",
      "--ei-highlight": "#eee0da",
      "--ei-on-accent": "#ffffff",
    },
    dark: {
      "--ei-accent": "#e0a286",
      "--ei-accent-strong": "#efb8a0",
      "--ei-accent-soft": "#b57d65",
      "--ei-accent-muted": "#c48a70",
      "--ei-accent-on-dark": "#e0a286",
      "--ei-selection": "#5a4237",
      "--ei-ring-soft": "#9f705c",
      "--ei-highlight": "#5e463b",
      "--ei-on-accent": "#1b1b1b",
    },
  },
};

/**
 * Neutral — Graphite on Fun, and the one accent where a hue rotation answers nothing.
 *
 * Graphite is achromatic: it seeds `--h-brand: 250` but then pins the whole accent family down
 * to chroma 0.017–0.035, so "rotate Pro's ramp to the colourway's brand hue" has no content
 * here. The real question is chroma, and the colourway has already answered it — Graphite's own
 * Fun light `--theme-accent` is `oklch(42% 0.035 250)`. Pro's neutral ramp is therefore Pro's
 * lightness and Graphite's chroma: hue 250, with Pro's authored chroma scaled to 0.40, which
 * lands `--ei-accent` at exactly C 0.035 in light and C 0.033 in dark. Both halves of the accent
 * then carry the same near-zero chroma at the same angle, which is what makes them one accent.
 *
 * The two ends were rejected for measured reasons, not taste:
 *
 * - **Chroma zero** would put the accent inside Pro's own neutral ramps. `--ei-ink*` and
 *   `--ei-level*` are chroma 0 exactly, so a grey accent at any lightness is a member of them:
 *   a Pro link would then differ from muted body text by nothing but value, on a page whose
 *   canvas, borders and levelling rows are already neutral.
 * - **Pro's full chroma** at hue 250 reads as a saturated blue 35° from Blue's 215, which would
 *   both duplicate an existing accent and contradict the colourway it wears.
 *
 * What makes it read as an accent is the one direction Pro's palette never goes. Pro's neutrals
 * are either exactly achromatic (ink ramp, levelling ramp, dark surfaces) or **warm** — paper,
 * surfaces and borders sit at hue 84–97 and chroma ≤ 0.010. This ramp is cool, ~155° opposite,
 * at 2.5–3.5× that chroma, so every step sits ΔEok 0.035–0.039 from the nearest Pro neutral
 * step: past the 0.02 the swatch assertion treats as one just-noticeable difference, and
 * measured as such in `accents.test.ts`. It is a cool cast rather than a colour, deliberately.
 *
 * Contrast headroom, all four measured against the real floors: 4.53:1 on paper (floor 4.5, the
 * tightest in the set — the light ΔL of −0.080 is what buys it), 8.84:1 on the dark canvas,
 * 7.66:1 and 9.45:1 on `--ei-surface-raised` against the 7.4 / 9.2 budgets, and 10.08:1 / 10.11:1
 * for ink on the fill.
 *
 * No safety hue is anywhere near it: the closest is caution gold at 178°, and Graphite re-tints
 * no safety token at all — being the colourway that spends the page's whole chroma budget on
 * the harm-reduction ramp is its entire premise.
 */
const neutral: Accent = {
  id: "neutral",
  label: "Neutral",
  swatch: "#cdd6e0",
  funPresetId: "graphite",
  pro: {
    light: {
      "--ei-accent": "#617284",
      "--ei-accent-strong": "#38434f",
      "--ei-accent-soft": "#7a8b9e",
      "--ei-accent-muted": "#505f6f",
      "--ei-accent-on-dark": "#a3b5c7",
      "--ei-selection": "#dae0e6",
      "--ei-ring-soft": "#b9c3cf",
      "--ei-highlight": "#e0e3e7",
      "--ei-on-accent": "#ffffff",
    },
    dark: {
      "--ei-accent": "#a3b5c7",
      "--ei-accent-strong": "#b9c8d9",
      "--ei-accent-soft": "#7f8e9f",
      "--ei-accent-muted": "#8b9cad",
      "--ei-accent-on-dark": "#a3b5c7",
      "--ei-selection": "#424950",
      "--ei-ring-soft": "#717e8d",
      "--ei-highlight": "#464d54",
      "--ei-on-accent": "#1b1b1b",
    },
  },
};

/**
 * Teal — Lagoon on Fun, and Pro's authored ramp itself on Pro, at Lagoon's `--h-brand` of 187.
 *
 * The one accent where the rotation is a no-op, because Pro's authored `--ei-accent*` family
 * already measures hue 186.3–187.7. Teal is Effect Index's colour, and this accent is the row
 * that lets a dose.wiki reader wear it on purpose instead of receiving it by default.
 *
 * **The dark half is a byte-identical carry-over of the authored ramp** — `#6fc4bb`, `#8fd6ce`,
 * `#4e9c95`, `#59aaa2`, and the same three washes — so dose.wiki's Teal in dark mode renders
 * exactly what Effect Index renders, seed for seed. Nothing needed deriving: the authored dark
 * ramp measures 7.89:1 base and 9.72:1 strong on `--ei-surface-raised` `#212121`, well over
 * Pro's own 7.4 / 9.2 budgets, which is unsurprising because those budgets were written for it.
 *
 * The light half is the one place this accent cannot be a carry-over, and the reason is a
 * pre-existing accessibility fact rather than anything about the accent axis: Effect Index's own
 * light link, `--ei-accent: #3d9991`, measures **3.12:1** on paper `#f6f5f1` and has always sat
 * below the 4.5:1 WCAG floor. So the light ramp is that ramp with a uniform ΔL of −0.092 across
 * `accent`, `strong`, `soft` and `muted` — no hue movement at all, only the darkening the floor
 * demands — which lifts `--ei-accent` to 4.55:1. `strong` then measures 9.30:1 and ink-on-fill
 * 10.14:1. Two publications therefore render the same hue at two lightnesses in light mode, and
 * that is deliberate: fixing the authored value would repaint Effect Index, which is a different
 * decision from shipping an accent row.
 *
 * `--ei-accent-on-dark` is `#6fc4bb` in both halves — the authored value verbatim, which is
 * `pro-theme.css`'s own single declaration of it, so the chrome rails render identically to
 * Effect Index's in either scheme.
 *
 * Safety adjacency is the widest in the set and needs no exemption. Against the authored angles
 * a brand at 187 sits 173° from danger rose (14), 139° from unsafe orange (48), 119° from
 * caution gold (68) and 27° from success green (160) — every one of them past the 10°
 * `accents.immunity.test.ts` treats as the reviewed minimum, and past the 23° every pair other
 * than Amber's clears. Lagoon re-seats `--h-green` to 150 anyway, on Abyss's precedent, which
 * widens the only near pair to 37°: teal and emerald are the two hues a reader is most likely to
 * confuse, so the colourway buys headroom it does not strictly need. The nearest other accent is
 * Blue at Abyss's 215, 28° away, which no test measures because accents do not have to be
 * mutually distinct — only distinguishable from the harm-reduction signal.
 */
const teal: Accent = {
  id: "teal",
  label: "Teal",
  swatch: "#99f6e4",
  funPresetId: "lagoon",
  pro: {
    light: {
      "--ei-accent": "#187d76",
      "--ei-accent-strong": "#044a45",
      "--ei-accent-soft": "#3d978f",
      "--ei-accent-muted": "#106862",
      "--ei-accent-on-dark": "#6fc4bb",
      "--ei-selection": "#cde5e2",
      "--ei-ring-soft": "#9ecdc7",
      "--ei-highlight": "#d7e7e5",
      "--ei-on-accent": "#ffffff",
    },
    dark: {
      "--ei-accent": "#6fc4bb",
      "--ei-accent-strong": "#8fd6ce",
      "--ei-accent-soft": "#4e9c95",
      "--ei-accent-muted": "#59aaa2",
      "--ei-accent-on-dark": "#6fc4bb",
      "--ei-selection": "#2f4f4c",
      "--ei-ring-soft": "#4a8a84",
      "--ei-highlight": "#335350",
      "--ei-on-accent": "#1b1b1b",
    },
  },
};

/**
 * Declaration order is emission order and menu order. `default` leads because it is home, and
 * `teal` trails because it is the newest row rather than a peer of the five hue rotations.
 */
export const ACCENTS: readonly Accent[] = [defaultAccent, blue, green, red, amber, neutral, teal];

const ACCENT_BY_ID = new Map<string, Accent>(ACCENTS.map((accent) => [accent.id, accent]));

export function isAccent(value: string | null | undefined): value is AccentId {
  return typeof value === "string" && ACCENT_BY_ID.has(value);
}

/**
 * Resolve an accent from storage or an attribute. An unknown or retired id degrades to the
 * default, which is the accent keyed by the attribute's absence — so a stale saved value renders
 * exactly the appearance a first-time reader gets, rather than erroring or leaving a block half
 * applied to a value no selector names.
 */
export function getAccent(id: string | null | undefined): Accent {
  return (isAccent(id) ? ACCENT_BY_ID.get(id) : undefined) ?? defaultAccent;
}
