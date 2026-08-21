import type { PalettePreset } from "./palettePresets";
import {
  retunedDarkLiterals,
  scrollThumbOverrides,
  scrollThumbOverridesLight,
  split,
} from "./presetRecipes";

/**
 * Lagoon — Effect Index's teal, worn over Fun's layout: aquamarine over dark
 * reef water at night, sea-glass paper by day.
 *
 * It is the Fun half of the `teal` accent (`src/theme/accents.ts`), and the two
 * halves are the same colour on purpose. The accent's Pro half carries Effect
 * Index's own `--ei-accent*` ramp; this colourway is that ramp's Fun reading, so
 * a reader who picks Teal gets one hue whichever visual style they are in.
 *
 * Measured: Effect Index's teal is OKLCH hue **187** — `#187d76` (its light
 * link) 187.7, `#6fc4bb` (its on-dark accent) 186.8, `#3d9991` (`pro-theme.css`'s
 * authored light `--ei-accent`) 187.3. `--h-brand: 187` is that hue, not a
 * neighbour of it.
 *
 * The literal ramp is Tailwind's teal scale, which measures hue 180-188 across
 * its steps (teal-200 `#99f6e4` at 180.4, teal-700 `#0f766e` at 186.4,
 * teal-800 `#115e59` at 188.2). The ~7° spread between the flattest literal and
 * the seed is the same shape Abyss carries at hue 215, and it is deliberate
 * here: the dark accent is pinned to `#99f6e4` because that hex is the `teal`
 * accent's declared swatch and `accents.test.ts` measures the swatch against
 * this colourway's rendered Fun-dark `--theme-accent` within ΔEok 0.02. The
 * literal wins where the two disagree; the seed drives everything derived.
 *
 * The brand seed group, re-seated together because `--h-brand` never travels
 * alone (`palettePresets.test.ts`, "re-seats the whole brand seed group"):
 *
 * - `--h-brand: 187` — Effect Index's teal, above.
 * - `--h-plum: 200` — surfaces. 13° deeper than the brand, so the canvas and
 *   panels read as water rather than as a dimmed accent (the Graphite lesson:
 *   surfaces sitting on the brand hue read as a vividly tinted theme). Between
 *   Canopy's 5° and Abyss's 20°: further would turn the lagoon navy, which is
 *   Abyss's page.
 * - `--h-text: 200` — matched to `--h-plum`, as every other colourway matches
 *   the two, so the near-neutral ink shares the surface family instead of
 *   cross-tinting it.
 * - `--h-violet: 222` — the surface-local secondary hue used by decorative
 *   and informational treatments such as the modal dim. Selected controls and
 *   inline references no longer consume it; those derive from the independent
 *   Accent axis.
 *
 * Safety: `--h-green` moves from the authored 160 to **150**, Abyss's precedent,
 * which widens brand-to-success from 27° to 37° and takes the success and
 * evidence ramps off the brand's shoulder. Moving a safety seed *away* from the
 * brand needs no exemption — an exemption covers a colourway that restates a
 * safety signal, and this restates nothing; it only buys separation. The
 * `--c-emerald*` scale follows the seed to Tailwind green, the mapping Abyss
 * already uses at 150, so the family stays coherent with its own hue. Nothing
 * in the dose or plateau tier ramps, the inline success/warning/danger/evidence
 * tokens, the semantic cards or the badges is touched.
 *
 * `--h-blue: 260` is left alone. Abyss has to move it because its cyan brand at
 * 215 sits 45° from the info blue; teal at 187 is 73° clear, so re-seating it
 * would move the info role for no reason.
 *
 * The scroll-thumb recipes apply, and both take chroma **0.08**. Teal is the
 * lowest-chroma brand hue in the set: the sRGB ceiling at hue 187 measures
 * 0.133 at L 76%, 0.109 at L 62% and 0.081 at L 50%. 0.08 is the largest seed
 * that keeps the recipe's stop *relationships* — the 1.3x and 1.1x scales that
 * give the gradient its shape — inside that ceiling; the only stop that still
 * clips is the dark L 50% end, by 0.007. Abyss's 0.13 clips four of six stops
 * at hue 215, so copying its number here would flatten most of the gradient
 * onto the gamut wall rather than make it more teal.
 *
 * The dark surfaces are a hue-200 ladder, measured in OKLCH: canvas L 14.7% /
 * chroma 0.020, surface-strong 19.2%, surface-soft 21.2%, panel 23.5%,
 * search-overlay 24.7%, surface-muted 25.5%, search-highlight 29.8% / 0.044.
 * Chroma climbs with lightness because it has to: at hue 200 the sRGB ceiling in
 * a near-black is about 0.04, so a flat-chroma ladder would either grey out the
 * top or clip the bottom.
 *
 * Contrast, resolved through `surface-tokens.generated.css` rather than read off
 * these literals. Fun dark, on this colourway's own canvas `#020d0e` — and, in
 * brackets, on Orchid's `#110617`, the canvas Fun dark paints without a
 * colourway: `--theme-accent` 15.62:1 (15.68:1); `--theme-accent-strong`, which
 * the base sheet derives as
 * `oklch(from rgb(var(--c-accent)) calc(l - 0.041) calc(c * 1.35) h)` and so
 * resolves to `#64efd8`, 13.95:1 (14.01:1); ink 19.69:1 / 14.36:1 / 10.21:1 for
 * primary / secondary / muted. Fun light, on canvas `#fcfdfd`: accent `#007e72`
 * 4.88:1, accent-strong `#006d63` 6.13:1, ink 13.85:1 / 9.59:1 / 6.28:1.
 *
 * That 4.88:1 is the lowest Fun-light accent in the set — Abyss 5.08, Canopy
 * 5.38, Sunset 6.24, Garnet 6.80, Orchid 6.85, Graphite 8.29 — and it clears the
 * 4.5 floor `accents.contrast.test.ts` asserts unconditionally. It is also the
 * pessimistic reading: the light ramp is the base sheet's own
 * `oklch(49% 0.19 var(--h-brand))`, whose chroma is far outside teal's gamut, and
 * the number above comes from clamping each sRGB channel, which lightens the
 * result. Reducing chroma at constant lightness the way a browser gamut-maps
 * gives `#027068` at 5.87:1. No colourway overrides the light accent ramp, so
 * this is the authored derivation doing what it does at a low-chroma hue, and
 * both readings clear the floor.
 *
 * Brand-band leaks: zero, measured in both themes when the colourway shipped
 * as a reader-facing accent (with the then-live `accents.immunity.test.ts`) —
 * no token whose authored value sits within 25° of hue 326 at chroma >= 0.05
 * survived unchanged under Lagoon.
 *
 * Kept as its own module because `palettePresets.ts` was decomposed to stay under
 * its cleanup budget, and the five accent colourways it shed into
 * `presetAccentColourways.ts` already measure 391 lines against 500. A sixth
 * there would leave under 50 lines of headroom and recreate the squeeze the
 * split just fixed. It registers in `PALETTE_PRESETS` with the other
 * accent-backing colourways, and takes `split` and the scroll recipes from
 * `presetRecipes.ts` like every other colourway.
 */
export const lagoon: PalettePreset = {
  id: "lagoon",
  name: "Lagoon",
  tagline: "Aquamarine shallows over dark reef water; sea-glass paper by day.",
  swatch: {
    dark: ["#020d0e", "#052325", "#eefbf9", "#2dd4bf", "#99f6e4"],
    light: ["#fcfdfd", "#def6f3", "#003136", "#0f766e", "#0d9488"],
  },
  overrides: split(
    {
      "--h-brand": "187",
      "--h-plum": "200",
      "--h-text": "200",
      "--h-violet": "222",
      "--c-accent": "153 246 228",
      "--c-violet": "34 211 238",
      "--c-violet-bright": "103 232 249",
      "--c-violet-deep": "8 145 178",
      "--c-plum-deep": "5 35 37",
      "--c-plum-pink": "15 118 110",
      "--c-fuchsia-200": "#ccfbf1",
      "--c-fuchsia-400": "#5eead4",
      "--c-fuchsia-600": "#0d9488",
      "--c-fuchsia-700": "#0f766e",
      "--c-violet-200": "#a5f3fc",
      "--c-violet-700": "#155e75",
      "--h-green": "150",
      "--c-emerald": "74 222 128",
      "--c-emerald-bright": "134 239 172",
      "--c-emerald-deep": "22 163 74",
      "--c-emerald-100": "#dcfce7",
      "--c-emerald-200": "#bbf7d0",
      "--c-emerald-700": "#15803d",
      "--c-emerald-800": "#166534",
    },
    {
      "--c-brand": "94 234 212",
      ...retunedDarkLiterals,
      "--theme-body-bg": "#020d0e",
      "--theme-accent": "#99f6e4",
      "--theme-panel-base": "#052325",
      "--theme-control-base": "oklch(24% 0.042 200)",
      "--theme-surface-soft": "#041d1e",
      "--theme-surface-muted": "#07282a",
      "--theme-surface-strong": "#031819",
      "--theme-search-overlay-bg": "#062628",
      "--theme-search-highlight-bg": "#0a3435",
      "--theme-search-highlight-text": "#ccfbf1",
      "--theme-home-glow-top": "rgba(13, 148, 136, 0.13)",
      "--theme-home-glow-bottom": "rgba(45, 212, 191, 0.06)",
      "--theme-home-nav-card-border": "rgba(45, 212, 191, 0.18)",
      ...scrollThumbOverrides(187, 0.08),
    },
    {
      "--c-brand": "13 148 136",
      "--theme-section-heading": "#0f766e",
      ...scrollThumbOverridesLight(187, 0.08),
      "--theme-search-overlay-bg": "oklch(96% 0.025 187)",
      "--theme-search-highlight-bg": "#d3f5ef",
      "--theme-search-highlight-text": "#042f2e",
      "--theme-home-nav-card-border": "oklch(58% 0.09 187 / 0.14)",
      "--theme-report-substance-text": "#115e59",
      "--theme-report-metadata-text": "#41615f",
      "--theme-report-phase-peak-text": "#0f766e",
      "--theme-avatar-gradient-from": "oklch(89.5% 0.06 187)",
      "--theme-avatar-gradient-to": "oklch(80.5% 0.09 200)",
      "--theme-home-glow-top": "rgba(15, 118, 110, 0.03)",
      "--theme-home-glow-bottom": "rgba(13, 148, 136, 0.022)",
    },
  ),
};
