import type { PalettePreset } from "./palettePresets";
import {
  retunedDarkLiterals,
  scrollThumbOverrides,
  scrollThumbOverridesLight,
  split,
} from "./presetRecipes";

/**
 * The colourways an accent wears.
 *
 * Every accent but `default` names one of these as its Fun half —
 * blue/Abyss, green/Canopy, red/Garnet, amber/Sunset, neutral/Graphite — and
 * `src/theme/accents.test.ts` pins the pairing by name rather than by count.
 * That is the seam this module is cut along, and the pairing is why five of the
 * seven shipped colourways sit here: they are the ones the accent axis depends
 * on by name.
 *
 * A new accent's Fun half is declared here. Declaration order within the file is
 * free — `PALETTE_PRESETS` in `palettePresets.ts` fixes the order the generated
 * accent and surface stylesheets emit.
 *
 * Orchid is deliberately absent: it is the authored base an accent falls back to
 * rather than a colourway an accent selects, so it stays beside
 * `DEFAULT_PRESET_ID` in `palettePresets.ts`.
 *
 * Authoring model, and the harm-reduction safety constraint each colourway below
 * respects: see `palettePresets.ts`.
 */

/** Bioluminescent cyan over deep ocean navy; seafoam paper by day.
 *  Safety: success re-seats toward yellow-green and info toward periwinkle so
 *  neither blurs into the cyan brand. */
export const abyss: PalettePreset = {
  id: "abyss",
  name: "Abyss",
  tagline: "Bioluminescent cyan over deep ocean navy.",
  swatch: {
    dark: ["#020a12", "#07202e", "#f2fafd", "#22d3ee", "#a5f3fc"],
    light: ["#fbfdfe", "#e2f1f6", "#0c3140", "#0e7490", "#0891b2"],
  },
  overrides: split(
    {
      "--h-brand": "215",
      "--h-plum": "235",
      "--h-text": "235",
      "--h-violet": "250",
      "--c-accent": "165 243 252",
      "--c-violet": "56 189 248",
      "--c-violet-bright": "125 211 252",
      "--c-violet-deep": "2 132 199",
      "--c-plum-deep": "7 29 46",
      "--c-plum-pink": "21 94 117",
      "--c-fuchsia-200": "#cffafe",
      "--c-fuchsia-400": "#67e8f9",
      "--c-fuchsia-600": "#0891b2",
      "--c-fuchsia-700": "#0e7490",
      "--c-violet-200": "#bae6fd",
      "--c-violet-700": "#075985",
      "--h-green": "150",
      "--c-emerald": "74 222 128",
      "--c-emerald-bright": "134 239 172",
      "--c-emerald-deep": "22 163 74",
      "--c-emerald-100": "#dcfce7",
      "--c-emerald-200": "#bbf7d0",
      "--c-emerald-700": "#15803d",
      "--c-emerald-800": "#166534",
      "--h-blue": "280",
      "--c-blue": "129 140 248",
      "--c-blue-deep": "55 48 163",
      "--c-blue-200": "#c7d2fe",
    },
    {
      "--c-brand": "103 232 249",
      ...retunedDarkLiterals,
      "--theme-body-bg": "#020a12",
      "--theme-accent": "#a5f3fc",
      "--theme-panel-base": "#07202e",
      "--theme-control-base": "oklch(24% 0.05 230)",
      "--theme-surface-soft": "#0c1a26",
      "--theme-surface-muted": "#102331",
      "--theme-surface-strong": "#081521",
      "--theme-search-overlay-bg": "#0e2231",
      "--theme-search-highlight-bg": "#0d2e3f",
      "--theme-search-highlight-text": "#cffafe",
      "--theme-home-glow-top": "rgba(2, 132, 199, 0.13)",
      "--theme-home-glow-bottom": "rgba(34, 211, 238, 0.06)",
      "--theme-home-nav-card-border": "rgba(34, 211, 238, 0.18)",
      ...scrollThumbOverrides(215, 0.13),
    },
    {
      "--c-brand": "8 145 178",
      "--theme-section-heading": "#0e7490",
      ...scrollThumbOverridesLight(215, 0.14),
      "--theme-search-overlay-bg": "oklch(96% 0.025 220)",
      "--theme-search-highlight-bg": "#d8f6fc",
      "--theme-search-highlight-text": "#083344",
      "--theme-home-nav-card-border": "oklch(58% 0.1 220 / 0.14)",
      "--theme-report-substance-text": "#155e75",
      "--theme-report-metadata-text": "#456575",
      "--theme-report-phase-peak-text": "#0e7490",
      "--theme-avatar-gradient-from": "oklch(89.5% 0.06 220)",
      "--theme-avatar-gradient-to": "oklch(80.5% 0.09 230)",
      "--theme-home-glow-top": "rgba(14, 116, 144, 0.032)",
      "--theme-home-glow-bottom": "rgba(2, 132, 199, 0.022)",
    },
  ),
};

/** Achromatic moon-silver; the safety ramp becomes the only color on the page.
 *  Safety: untouched — that's the point. */
export const graphite: PalettePreset = {
  id: "graphite",
  name: "Graphite",
  tagline: "Achromatic moon-silver — safety colors carry all the chroma.",
  achromatic: true,
  swatch: {
    dark: ["#08090b", "#16181d", "#f4f5f7", "#9aa7b8", "#cdd6e0"],
    light: ["#f7f7f5", "#e9e9e6", "#24272e", "#52616f", "#38424d"],
  },
  overrides: split(
    {
      "--h-brand": "250",
      "--h-plum": "250",
      "--h-text": "250",
      "--h-violet": "250",
      "--c-accent": "205 214 224",
      "--c-violet": "148 163 184",
      "--c-violet-bright": "203 213 225",
      "--c-violet-deep": "71 85 105",
      "--c-plum-deep": "15 18 25",
      "--c-plum-pink": "71 85 105",
      "--c-fuchsia-200": "#e2e8f0",
      "--c-fuchsia-400": "#cbd5e1",
      "--c-fuchsia-600": "#475569",
      "--c-fuchsia-700": "#334155",
      "--c-violet-200": "#e2e8f0",
      "--c-violet-700": "#1e293b",
    },
    {
      "--c-brand": "154 167 184",
      ...retunedDarkLiterals,
      "--theme-body-bg": "#08090b",
      "--theme-accent": "#cdd6e0",
      "--theme-panel-base": "#16181d",
      "--theme-control-base": "oklch(25% 0.008 250)",
      "--theme-surface-soft": "#14161a",
      "--theme-surface-muted": "#191c21",
      "--theme-surface-strong": "#0e1013",
      "--theme-search-overlay-bg": "#16191e",
      "--theme-search-highlight-bg": "#262b33",
      "--theme-search-highlight-text": "#e6eaef",
      "--theme-home-glow-top": "rgba(71, 85, 105, 0.1)",
      "--theme-home-glow-bottom": "rgba(148, 163, 184, 0.05)",
      "--theme-home-nav-card-border": "rgba(154, 167, 184, 0.18)",
      // The dark-mode retune raised the chroma of the plum-seeded surfaces
      // 1.7x-8.9x (page stops, chrome rail, fields, neutral panel, active nav).
      // At hue 250 that reads as a vivid *blue* theme, so — as in Graphite's
      // light mode below — the whole family is pinned back down to near-zero
      // chroma to keep the palette achromatic. The dialog scrim needs no pin:
      // it is a near-black dim at C=0.04 in every palette.
      "--theme-page-start": "oklch(45% 0.03 250)",
      "--theme-page-mid": "oklch(13.2% 0.009 250)",
      "--theme-chrome-rail-base": "oklch(15.5% 0.008 250)",
      "--theme-field-surface": "oklch(20.3% 0.01 250)",
      // Tracks the base token's lift off the rail (see site-colors.css): raised
      // to a 1.19 luminance ratio over Graphite's own L15.5% rail.
      "--theme-field-on-chrome-surface": "oklch(24% 0.009 250)",
      "--theme-field-on-panel-surface": "oklch(16% 0.014 250)",
      "--theme-field-on-panel-surface-alt": "oklch(14% 0.012 250)",
      "--theme-article-neutral-panel-base": "oklch(22.9% 0.014 250)",
      ...scrollThumbOverrides(250, 0.02),
    },
    {
      "--c-brand": "82 97 111",
      // The light theme derives accents/borders from oklch(<L> 0.1–0.2 hue),
      // which reads as a vivid *blue* theme at hue 250. Graphite's light mode
      // pins the whole family down to near-zero chroma so it stays achromatic.
      "--theme-accent-strong": "oklch(36% 0.03 250)",
      "--theme-accent": "oklch(42% 0.035 250)",
      "--theme-accent-soft": "oklch(50% 0.03 250)",
      "--theme-accent-muted": "oklch(45% 0.025 250)",
      "--theme-panel-base": "oklch(95.5% 0.005 250)",
      "--theme-control-base": "oklch(94% 0.006 250)",
      "--theme-card-border": "oklch(48% 0.03 250 / 0.2)",
      "--theme-card-border-strong": "oklch(45% 0.035 250 / 0.32)",
      "--theme-frosted-panel-border": "oklch(58% 0.02 250 / 0.16)",
      "--theme-frosted-panel-hover-border": "oklch(50% 0.03 250 / 0.22)",
      "--theme-frosted-control-border": "oklch(58% 0.02 250 / 0.18)",
      "--theme-frosted-control-hover-border": "oklch(47% 0.03 250 / 0.26)",
      // WCAG 1.4.11, per the note on --theme-field-border in site-colors.css.
      // Opaque, and the only border in this file that is: this declaration is
      // Graphite's *light* value, but a .theme-chrome-dark island in light mode
      // keeps the dark L20.3% field fill above, so the one value has to mark a
      // field on both grounds. The old oklch(50% 0.025 250 / 0.3) painted #bec8d4
      // on the light fill (1.51:1) and #282e35 on the dark one (1.32:1), and no
      // alpha under ~0.82 clears 3:1 on both, so the alpha drops. L61% opaque
      // paints #788592: 3.38:1 against Graphite's light field fill #e9f3fe and
      // 4.76:1 against its dark fill #13171b, within a tenth of the base sheet's
      // own light border weight (3.46:1).
      "--theme-field-border": "oklch(61% 0.025 250)",
      "--theme-selection": "oklch(50% 0.03 250 / 0.18)",
      "--theme-section-heading": "#47535f",
      ...scrollThumbOverridesLight(250, 0.02),
      "--theme-search-overlay-bg": "oklch(96% 0.006 250)",
      "--theme-search-highlight-bg": "#e4e7ea",
      "--theme-search-highlight-text": "#1e242c",
      "--theme-home-nav-card-border": "oklch(58% 0.02 250 / 0.14)",
      "--theme-report-substance-text": "#334155",
      "--theme-report-metadata-text": "#565b64",
      "--theme-report-phase-peak-text": "#475569",
      "--theme-avatar-gradient-from": "oklch(89.5% 0.012 250)",
      "--theme-avatar-gradient-to": "oklch(80.5% 0.02 250)",
      "--theme-home-glow-top": "rgba(71, 85, 105, 0.028)",
      "--theme-home-glow-bottom": "rgba(100, 116, 139, 0.02)",
    },
  ),
};

/** Leaf green and moss under a forest canopy; fern-and-cream paper by day.
 *  Safety: success re-seats from emerald to teal so "safe" callouts never
 *  blur into the leaf-green brand. The violet selected/info role is kept. */
export const canopy: PalettePreset = {
  id: "canopy",
  name: "Canopy",
  tagline: "Leaf green and moss under a forest canopy.",
  swatch: {
    dark: ["#06110b", "#0e2517", "#f0faf2", "#4ade80", "#bbf7d0"],
    light: ["#f7fbf5", "#e2f1dd", "#17351f", "#15803d", "#16a34a"],
  },
  overrides: split(
    {
      "--h-brand": "150",
      "--h-plum": "155",
      "--h-text": "155",
      // Selected/info surfaces (active tabs) shift from violet to slate-blue:
      // purple was the lone clashing hue on an otherwise green page.
      "--h-violet": "250",
      "--c-accent": "187 247 208",
      "--c-plum-deep": "14 37 23",
      "--c-plum-pink": "21 128 61",
      "--c-fuchsia-200": "#dcfce7",
      "--c-fuchsia-400": "#86efac",
      "--c-fuchsia-600": "#16a34a",
      "--c-fuchsia-700": "#15803d",
      "--h-green": "185",
      "--c-emerald": "45 212 191",
      "--c-emerald-bright": "94 234 212",
      "--c-emerald-deep": "13 148 136",
      "--c-emerald-100": "#ccfbf1",
      "--c-emerald-200": "#99f6e4",
      "--c-emerald-700": "#0f766e",
      "--c-emerald-800": "#115e59",
    },
    {
      "--c-brand": "74 222 128",
      ...retunedDarkLiterals,
      "--theme-body-bg": "#06110b",
      "--theme-accent": "#bbf7d0",
      "--theme-panel-base": "#0e2517",
      "--theme-control-base": "oklch(24% 0.045 155)",
      "--theme-surface-soft": "#0f2016",
      "--theme-surface-muted": "#132a1c",
      "--theme-surface-strong": "#091a10",
      "--theme-search-overlay-bg": "#10231a",
      "--theme-search-highlight-bg": "#17402a",
      "--theme-search-highlight-text": "#dcfce7",
      "--theme-home-glow-top": "rgba(21, 128, 61, 0.13)",
      "--theme-home-glow-bottom": "rgba(74, 222, 128, 0.06)",
      "--theme-home-nav-card-border": "rgba(74, 222, 128, 0.18)",
      ...scrollThumbOverrides(150, 0.11),
    },
    {
      "--c-brand": "21 128 61",
      // Green-700 #15803d measured 4.41:1 on this preset's own
      // --theme-surface-muted #e6f4e8, below the 4.5:1 text floor; the heading
      // is small text in .theme-portal-group-heading, so the large-text
      // allowance does not apply. #117e3b is the same green (hue 150.1,
      // chroma 0.137 both unmoved) seven tenths of a point of OKLCH lightness
      // darker, and measures 4.55:1 there. This declaration is emitted into
      // both surface-tokens.generated.css (the "canopy" surface) and
      // accent-tokens.generated.css (the "green" accent), so it fixes both.
      "--theme-section-heading": "#117e3b",
      ...scrollThumbOverridesLight(150, 0.12),
      "--theme-search-overlay-bg": "oklch(96% 0.025 150)",
      "--theme-search-highlight-bg": "#d9f5e2",
      "--theme-search-highlight-text": "#14532d",
      "--theme-home-nav-card-border": "oklch(58% 0.09 150 / 0.14)",
      "--theme-report-substance-text": "#166534",
      "--theme-report-metadata-text": "#43604d",
      // Green-700 #15803d measured 4.44:1 on this preset's own
      // --theme-report-phase-peak-bg #eaf3ed, below the 4.5:1 text floor.
      // #117536 is the same green three points of OKLCH lightness darker and
      // measures 5.12:1 there, still clear of --theme-report-substance-text
      // #166534 above.
      "--theme-report-phase-peak-text": "#117536",
      "--theme-avatar-gradient-from": "oklch(89.5% 0.06 150)",
      "--theme-avatar-gradient-to": "oklch(80.5% 0.09 155)",
      "--theme-home-glow-top": "rgba(22, 101, 52, 0.03)",
      "--theme-home-glow-bottom": "rgba(21, 128, 61, 0.022)",
    },
  ),
};

/** Scarlet on black cherry; a quieter claret-on-porcelain by day.
 *  Safety (the trickiest preset): danger re-seats from rose toward vivid
 *  magenta-pink so alarms differ from the scarlet brand by hue, not just
 *  intensity. Unsafe orange is untouched — verify scarlet-vs-orange
 *  adjacency on interaction cards when tuning this preset. */
export const garnet: PalettePreset = {
  id: "garnet",
  name: "Garnet",
  tagline: "Scarlet on black cherry; claret on porcelain by day.",
  swatch: {
    dark: ["#140508", "#2b0b12", "#f9f1f2", "#ef5b5b", "#fca5a5"],
    light: ["#fdfbfa", "#f8e7e5", "#47191d", "#b91c1c", "#dc2626"],
  },
  overrides: split(
    {
      "--h-brand": "25",
      "--h-plum": "15",
      "--h-text": "15",
      // Selected/info surfaces — active tabs, reference controls, the modal
      // dim — join the black-cherry family rather than staying Orchid's 290.
      // The other direction is blocked: danger is re-seated to magenta-pink
      // at 350 below, and unsafe orange 48 / caution gold 68 sit just above.
      "--h-violet": "15",
      "--c-accent": "252 165 165",
      "--c-plum-deep": "43 11 18",
      "--c-plum-pink": "185 28 28",
      "--c-fuchsia-200": "#fee2e2",
      "--c-fuchsia-400": "#f87171",
      "--c-fuchsia-600": "#dc2626",
      "--c-fuchsia-700": "#b91c1c",
      "--h-rose": "350",
      "--c-rose": "236 72 153",
      "--c-rose-bright": "244 114 182",
      "--c-rose-deep": "219 39 119",
      "--c-rose-100": "#fce7f3",
      "--c-rose-200": "#fbcfe8",
      "--c-rose-700": "#be185d",
      "--c-rose-800": "#9d174d",
    },
    {
      "--c-brand": "248 113 113",
      ...retunedDarkLiterals,
      "--theme-body-bg": "#140508",
      "--theme-accent": "#fca5a5",
      "--theme-panel-base": "#2b0b12",
      "--theme-control-base": "oklch(24% 0.055 15)",
      "--theme-surface-soft": "#241014",
      "--theme-surface-muted": "#2d151a",
      "--theme-surface-strong": "#1a0a0d",
      "--theme-search-overlay-bg": "#251116",
      "--theme-search-highlight-bg": "#46181f",
      "--theme-search-highlight-text": "#fee2e2",
      "--theme-home-glow-top": "rgba(185, 28, 28, 0.13)",
      "--theme-home-glow-bottom": "rgba(248, 113, 113, 0.06)",
      "--theme-home-nav-card-border": "rgba(248, 113, 113, 0.18)",
      "--theme-interaction-danger-card-primary": "#4d1531",
      "--theme-semantic-danger-badge-text": "rgb(251 207 232)",
      ...scrollThumbOverrides(25, 0.13),
    },
    {
      "--c-brand": "185 28 28",
      "--theme-section-heading": "#b91c1c",
      ...scrollThumbOverridesLight(25, 0.14),
      "--theme-search-overlay-bg": "oklch(96% 0.02 25)",
      "--theme-search-highlight-bg": "#f8dfe0",
      "--theme-search-highlight-text": "#47191d",
      "--theme-home-nav-card-border": "oklch(55% 0.12 25 / 0.15)",
      "--theme-report-substance-text": "#991b1b",
      "--theme-report-metadata-text": "#664c50",
      "--theme-report-phase-peak-text": "#b91c1c",
      "--theme-avatar-gradient-from": "oklch(89.5% 0.05 25)",
      "--theme-avatar-gradient-to": "oklch(80.5% 0.08 20)",
      "--theme-home-glow-top": "rgba(185, 28, 28, 0.03)",
      "--theme-home-glow-bottom": "rgba(220, 38, 38, 0.022)",
    },
  ),
};

/** Coral horizon over dusk violet; golden-hour paper in light mode. The logo
 *  gradient becomes the actual sunset: gold → coral → rose → dusk violet.
 *  Safety: caution re-seats to pure gold and unsafe deepens to burnt
 *  vermilion so brand coral, gold caution, and burnt-orange unsafe stay
 *  three distinct steps. */
export const sunset: PalettePreset = {
  id: "sunset",
  name: "Sunset",
  tagline: "Coral horizon over dusk violet; golden-hour paper by day.",
  swatch: {
    dark: ["#170a1c", "#2d1130", "#fdf3ec", "#fb8a6a", "#fdc38f"],
    light: ["#fdf6ec", "#fae5cf", "#3d1f33", "#b83a52", "#d1584a"],
  },
  overrides: split(
    {
      "--h-brand": "45",
      "--h-plum": "310",
      "--h-text": "320",
      // Selected/info surfaces take the palette's own dusk violet instead of
      // Orchid's 290 — it is the fourth stop of the sunset wordmark. The
      // coral brand at 45 is 95° away, so a selected tab never blurs into it.
      "--h-violet": "310",
      "--c-accent": "253 195 143",
      "--c-plum-deep": "45 17 48",
      "--c-plum-pink": "184 58 82",
      "--c-fuchsia-200": "#fde3cd",
      "--c-fuchsia-400": "#fb8a6a",
      "--c-fuchsia-600": "#c05f2e",
      "--c-fuchsia-700": "#b83a52",
      "--h-gold": "95",
      "--c-amber": "234 179 8",
      "--c-amber-bright": "250 204 21",
      "--c-amber-deep": "161 98 7",
      "--c-amber-100": "#fef9c3",
      "--c-amber-200": "#fef08a",
      "--c-amber-700": "#a16207",
      "--c-amber-800": "#854d0e",
      "--h-orange": "35",
      "--c-orange": "220 70 20",
    },
    {
      "--c-brand": "232 93 138",
      ...retunedDarkLiterals,
      "--theme-body-bg": "#170a1c",
      "--theme-accent": "#fdc38f",
      "--theme-panel-base": "#2d1130",
      "--theme-control-base": "oklch(24% 0.055 320)",
      "--theme-surface-soft": "#241227",
      "--theme-surface-muted": "#2c1730",
      "--theme-surface-strong": "#180b1b",
      "--theme-search-overlay-bg": "#241426",
      "--theme-search-highlight-bg": "#45203a",
      "--theme-search-highlight-text": "#fde3cd",
      "--theme-home-glow-top": "rgba(126, 34, 206, 0.13)",
      "--theme-home-glow-bottom": "rgba(251, 138, 106, 0.07)",
      "--theme-home-nav-card-border": "rgba(251, 138, 106, 0.2)",
      "--theme-warning-bg": "#2b2208",
      "--theme-construction-banner-text": "#facc15",
      ...scrollThumbOverrides(40, 0.12),
    },
    {
      "--c-brand": "184 58 82",
      "--theme-section-heading": "#b83a52",
      ...scrollThumbOverridesLight(40, 0.13),
      "--theme-body-bg": "oklch(97.3% 0.012 85)",
      "--theme-page-start": "oklch(97.6% 0.011 85)",
      "--theme-page-mid": "oklch(97.1% 0.013 85)",
      "--theme-page-end": "oklch(96.6% 0.015 85)",
      "--theme-panel-base": "oklch(94% 0.03 70)",
      "--theme-control-base": "oklch(93% 0.032 70)",
      "--theme-search-overlay-bg": "oklch(96% 0.025 340)",
      "--theme-search-highlight-bg": "#fbe3d5",
      "--theme-search-highlight-text": "#4a1a2e",
      "--theme-home-nav-card-border": "oklch(58% 0.1 40 / 0.15)",
      "--theme-report-substance-text": "#9c2c47",
      "--theme-report-metadata-text": "#5f4658",
      "--theme-report-phase-peak-text": "#b83a52",
      "--theme-avatar-gradient-from": "oklch(90% 0.05 60)",
      "--theme-avatar-gradient-to": "oklch(80% 0.09 345)",
      "--theme-home-glow-top": "rgba(184, 58, 82, 0.03)",
      "--theme-home-glow-bottom": "rgba(217, 119, 6, 0.022)",
    },
  ),
};
