import type { PalettePreset } from "./palettePresets";
import {
  retunedDarkLiterals,
  scrollThumbOverrides,
  scrollThumbOverridesLight,
  split,
} from "./presetRecipes";

/**
 * The colourways that are only ever chosen from the Theme Lab.
 *
 * `src/theme/accents.test.ts:52-80` asserts of each id here that it still
 * resolves as a colourway — editors have saved palettes pointing at it, so the id
 * is frozen — and that no accent claims it as a Fun half. Two are moods the
 * accent row has no slot for (Twilight, Parchment); three are the jokes and the
 * seasonals (🦅🦅🦅, Halloween, Yuletide), fun to wear from the Lab but not a
 * publication appearance. Letterpress is the sixth member of that list and
 * already has its own module, `journalPreset.ts`.
 *
 * Authoring model, and the harm-reduction safety constraint each preset below
 * respects: see `palettePresets.ts`.
 */

/** Periwinkle indigo over blue-violet dusk; lavender-white paper.
 *  Safety: info re-seats to cyan so informational chips separate from the
 *  indigo brand. */
export const twilight: PalettePreset = {
  id: "twilight",
  name: "Twilight",
  tagline: "Periwinkle indigo over blue-violet dusk.",
  swatch: {
    dark: ["#050414", "#131034", "#f4f3fc", "#818cf8", "#c7d2fe"],
    light: ["#fcfcff", "#e9e8fa", "#211d4f", "#4f46e5", "#6366f1"],
  },
  overrides: split(
    {
      "--h-brand": "277",
      "--h-plum": "285",
      "--h-text": "285",
      "--h-violet": "300",
      "--theme-molecule-hue-rotate": "-58deg",
      "--c-accent": "199 210 254",
      "--c-violet": "167 139 250",
      "--c-violet-bright": "196 181 253",
      "--c-plum-deep": "19 16 52",
      "--c-plum-pink": "67 56 202",
      "--c-fuchsia-200": "#e0e7ff",
      "--c-fuchsia-400": "#a5b4fc",
      "--c-fuchsia-600": "#4f46e5",
      "--c-fuchsia-700": "#4338ca",
      "--h-blue": "220",
      "--c-blue": "34 211 238",
      "--c-blue-deep": "14 116 144",
      "--c-blue-200": "#a5f3fc",
    },
    {
      "--c-brand": "165 180 252",
      ...retunedDarkLiterals,
      "--theme-body-bg": "#050414",
      "--theme-accent": "#c7d2fe",
      "--theme-panel-base": "#131034",
      "--theme-control-base": "oklch(24% 0.06 285)",
      "--theme-surface-soft": "#100e2b",
      "--theme-surface-muted": "#161340",
      "--theme-surface-strong": "#0b0a22",
      "--theme-search-overlay-bg": "#171438",
      "--theme-search-highlight-bg": "#232057",
      "--theme-search-highlight-text": "#e0e7ff",
      "--theme-home-glow-top": "rgba(67, 56, 202, 0.13)",
      "--theme-home-glow-bottom": "rgba(129, 140, 248, 0.06)",
      "--theme-home-nav-card-border": "rgba(129, 140, 248, 0.18)",
      ...scrollThumbOverrides(277, 0.13),
    },
    {
      "--c-brand": "79 70 229",
      "--theme-section-heading": "#4f46e5",
      ...scrollThumbOverridesLight(277, 0.14),
      "--site-logo-stop-3": "#3730a3",
      "--theme-search-overlay-bg": "oklch(96% 0.03 285)",
      "--theme-search-highlight-bg": "#e3e6fb",
      "--theme-search-highlight-text": "#1e1b4b",
      "--theme-home-nav-card-border": "oklch(58% 0.1 277 / 0.14)",
      "--theme-report-substance-text": "#4338ca",
      "--theme-report-metadata-text": "#4c4a72",
      "--theme-report-phase-peak-text": "#4f46e5",
      "--theme-avatar-gradient-from": "oklch(89.5% 0.07 285)",
      "--theme-avatar-gradient-to": "oklch(80.5% 0.1 290)",
      "--theme-home-glow-top": "rgba(79, 70, 229, 0.032)",
      "--theme-home-glow-bottom": "rgba(109, 40, 217, 0.022)",
    },
  ),
};

/** Light-first: mulberry ink on warm sepia paper; candlelit cocoa after dark.
 *  Safety: caution amber deepens for contrast on cream panels. The light
 *  canvas is re-skinned explicitly (warm paper, not the hue-tinted white). */
export const parchment: PalettePreset = {
  id: "parchment",
  name: "Parchment",
  tagline: "Mulberry ink on warm sepia paper; candlelit cocoa after dark.",
  swatch: {
    dark: ["#140d0a", "#261913", "#f4e9dc", "#c96f9d", "#e3aec7"],
    light: ["#f6efe3", "#efe2cc", "#3a2430", "#8f2d63", "#b0416e"],
  },
  overrides: split(
    {
      "--h-brand": "350",
      "--h-plum": "40",
      "--h-text": "20",
      "--h-violet": "330",
      "--theme-molecule-hue-rotate": "35deg",
      "--theme-molecule-saturate": "0.75",
      "--c-accent": "227 174 199",
      "--c-violet": "167 100 160",
      "--c-violet-bright": "196 140 190",
      "--c-violet-deep": "134 61 118",
      "--c-plum-deep": "38 25 19",
      "--c-plum-pink": "143 45 99",
      "--c-fuchsia-200": "#f4d8e5",
      "--c-fuchsia-400": "#d68fb2",
      "--c-fuchsia-600": "#8f2d63",
      "--c-fuchsia-700": "#7c2455",
      "--c-violet-200": "#e8d6e4",
      "--c-violet-700": "#5e2049",
      "--c-amber-deep": "161 98 7",
      "--c-amber-700": "#92400e",
      "--c-amber-800": "#78350f",
    },
    {
      "--c-brand": "201 111 157",
      ...retunedDarkLiterals,
      "--theme-body-bg": "#140d0a",
      "--theme-accent": "#e3aec7",
      "--theme-panel-base": "#261913",
      "--theme-control-base": "oklch(24.5% 0.03 40)",
      "--theme-surface-soft": "#221712",
      "--theme-surface-muted": "#2a1d16",
      "--theme-surface-strong": "#19100c",
      "--theme-search-overlay-bg": "#241a14",
      "--theme-search-highlight-bg": "#3c2a2e",
      "--theme-search-highlight-text": "#f4d8e5",
      "--theme-home-glow-top": "rgba(143, 45, 99, 0.13)",
      "--theme-home-glow-bottom": "rgba(201, 111, 157, 0.06)",
      "--theme-home-nav-card-border": "rgba(201, 111, 157, 0.18)",
      ...scrollThumbOverrides(350, 0.09),
    },
    {
      "--c-brand": "143 45 99",
      // The light chrome rail follows the brand hue at high lightness, which
      // renders baby-pink against the sepia paper — re-pin it to warm tan.
      "--theme-chrome-rail-base": "oklch(88.5% 0.035 80)",
      "--theme-chrome-surface": "oklch(89% 0.032 80)",
      "--theme-chrome-surface-strong": "oklch(85% 0.04 78)",
      "--theme-chrome-border": "oklch(46% 0.06 60 / 0.25)",
      "--theme-menu-surface": "oklch(91% 0.035 80)",
      "--theme-section-heading": "#8f2d63",
      ...scrollThumbOverridesLight(350, 0.11),
      "--theme-body-bg": "oklch(95.5% 0.02 85)",
      "--theme-page-start": "oklch(96% 0.019 85)",
      "--theme-page-mid": "oklch(95.2% 0.021 85)",
      "--theme-page-end": "oklch(94.4% 0.023 85)",
      "--theme-panel-base": "oklch(92.5% 0.032 82)",
      "--theme-control-base": "oklch(91.5% 0.035 82)",
      "--site-logo-stop-3": "#691d48",
      "--theme-search-overlay-bg": "oklch(93.5% 0.03 60)",
      "--theme-search-highlight-bg": "#f4dde8",
      "--theme-search-highlight-text": "#47191d",
      "--theme-home-nav-card-border": "oklch(52% 0.09 350 / 0.16)",
      "--theme-report-substance-text": "#7c2455",
      "--theme-report-metadata-text": "#6b4a52",
      "--theme-report-phase-peak-text": "#8f2d63",
      "--theme-avatar-gradient-from": "oklch(88% 0.05 350)",
      "--theme-avatar-gradient-to": "oklch(79% 0.08 345)",
      "--theme-home-glow-top": "rgba(143, 45, 99, 0.03)",
      "--theme-home-glow-bottom": "rgba(176, 65, 110, 0.022)",
    },
  ),
};

/** Red, white, and blue: red glow and blue glass over midnight navy; crisp
 *  federal paper with red-and-navy ink by day. The dark wordmark runs pale
 *  blue → white → red → blue. Safety: a red brand collides with danger rose,
 *  so danger re-seats to magenta-pink (the Garnet treatment); the blue
 *  selected/info role is the palette's second color. */
export const liberty: PalettePreset = {
  id: "liberty",
  name: "🦅🦅🦅",
  tagline: "Stars-and-stripes — red and white over midnight navy.",
  swatch: {
    dark: ["#050a17", "#101c38", "#f4f7fc", "#ef4444", "#93c5fd"],
    light: ["#fdfdfe", "#e3ecf8", "#172a54", "#b91c1c", "#1e40af"],
  },
  overrides: split(
    {
      "--h-brand": "20",
      "--h-plum": "260",
      "--h-text": "260",
      "--h-violet": "250",
      "--theme-molecule-hue-rotate": "-75deg",
      "--c-accent": "191 219 254",
      "--c-violet": "59 130 246",
      "--c-violet-bright": "96 165 250",
      "--c-violet-deep": "29 78 216",
      "--c-plum-deep": "12 25 56",
      "--c-plum-pink": "190 18 60",
      "--c-fuchsia-200": "#dbeafe",
      "--c-fuchsia-400": "#f8fafc",
      "--c-fuchsia-600": "#dc2626",
      // Deep red so the light wordmark's red → blue seam blends through a
      // muted dark tone instead of a visible purple.
      "--c-fuchsia-700": "#7f1d1d",
      "--c-violet-200": "#dbeafe",
      "--c-violet-700": "#1e3a8a",
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
      "--c-brand": "239 68 68",
      ...retunedDarkLiterals,
      "--theme-body-bg": "#050a17",
      "--theme-accent": "#93c5fd",
      "--theme-panel-base": "#101c38",
      "--theme-control-base": "oklch(24% 0.055 262)",
      "--theme-surface-soft": "#0d1830",
      "--theme-surface-muted": "#12203f",
      "--theme-surface-strong": "#091226",
      "--theme-search-overlay-bg": "#0f1d38",
      "--theme-search-highlight-bg": "#1d3260",
      "--theme-search-highlight-text": "#dbeafe",
      "--theme-home-glow-top": "rgba(29, 78, 216, 0.14)",
      "--theme-home-glow-bottom": "rgba(239, 68, 68, 0.07)",
      "--theme-home-nav-card-border": "rgba(239, 68, 68, 0.2)",
      "--theme-interaction-danger-card-primary": "#4d1531",
      "--theme-semantic-danger-badge-text": "rgb(251 207 232)",
      ...scrollThumbOverrides(25, 0.13),
    },
    {
      "--c-brand": "185 28 28",
      // Red-hue formulas would tint the light chrome and panels pink; pin
      // them to pale federal blue so "white and blue" carries the light mode.
      "--theme-panel-base": "oklch(95.5% 0.02 255)",
      "--theme-control-base": "oklch(94% 0.022 255)",
      "--theme-chrome-rail-base": "oklch(88.5% 0.045 255)",
      "--theme-chrome-surface": "oklch(89% 0.04 255)",
      "--theme-chrome-surface-strong": "oklch(85% 0.05 255)",
      "--theme-chrome-border": "oklch(46% 0.1 255 / 0.25)",
      "--theme-menu-surface": "oklch(91% 0.04 255)",
      "--site-logo-stop-3": "#1e40af",
      "--theme-section-heading": "#b91c1c",
      "--theme-search-overlay-bg": "oklch(96% 0.015 260)",
      "--theme-search-highlight-bg": "#dbe7fb",
      "--theme-search-highlight-text": "#172a54",
      "--theme-home-nav-card-border": "oklch(55% 0.12 25 / 0.15)",
      "--theme-report-substance-text": "#1e3a8a",
      "--theme-report-metadata-text": "#4a5878",
      "--theme-report-phase-peak-text": "#be123c",
      "--theme-avatar-gradient-from": "oklch(89.5% 0.045 260)",
      "--theme-avatar-gradient-to": "oklch(80.5% 0.08 250)",
      "--theme-home-glow-top": "rgba(30, 64, 175, 0.03)",
      "--theme-home-glow-bottom": "rgba(185, 28, 28, 0.022)",
      ...scrollThumbOverridesLight(25, 0.14),
    },
  ),
};

/** Pumpkin lanterns over a witching-hour purple night; autumn parchment by
 *  day. The dark wordmark runs peach → pumpkin → orange → witch purple.
 *  Safety: a pumpkin brand collides with both caution amber and unsafe
 *  orange, so caution re-seats to pure gold and unsafe deepens to burnt
 *  sienna (the Sunset treatment); the purple selected/info role is the
 *  palette's second color. */
export const halloween: PalettePreset = {
  id: "halloween",
  name: "Halloween",
  tagline: "Pumpkin lanterns over a witching-hour purple night.",
  swatch: {
    dark: ["#0b0612", "#200f31", "#f7f1fb", "#fb923c", "#fed7aa"],
    light: ["#f7efdf", "#efdfc4", "#3c2140", "#ea580c", "#c2410c"],
  },
  overrides: split(
    {
      "--h-brand": "55",
      "--h-plum": "300",
      "--h-text": "300",
      "--h-violet": "300",
      "--theme-molecule-hue-rotate": "95deg",
      "--c-accent": "254 215 170",
      "--c-violet": "168 85 247",
      "--c-violet-bright": "192 132 252",
      "--c-violet-deep": "126 34 206",
      "--c-plum-deep": "26 10 41",
      "--c-plum-pink": "126 34 206",
      "--c-fuchsia-200": "#ffedd5",
      "--c-fuchsia-400": "#fb923c",
      "--c-fuchsia-600": "#ea580c",
      "--c-fuchsia-700": "#c2410c",
      "--c-violet-200": "#e9d5ff",
      "--c-violet-700": "#581c87",
      "--h-gold": "95",
      "--c-amber": "234 179 8",
      "--c-amber-bright": "250 204 21",
      "--c-amber-deep": "161 98 7",
      "--c-amber-100": "#fef9c3",
      "--c-amber-200": "#fef08a",
      "--c-amber-700": "#a16207",
      "--c-amber-800": "#854d0e",
      "--h-orange": "40",
      "--c-orange": "194 65 12",
    },
    {
      "--c-brand": "251 146 60",
      ...retunedDarkLiterals,
      "--theme-body-bg": "#0b0612",
      "--theme-accent": "#fed7aa",
      "--theme-panel-base": "#200f31",
      "--theme-control-base": "oklch(23.5% 0.06 305)",
      "--theme-surface-soft": "#180d26",
      "--theme-surface-muted": "#1e1130",
      "--theme-surface-strong": "#120a1d",
      "--theme-search-overlay-bg": "#1c1030",
      "--theme-search-highlight-bg": "#3a1f52",
      "--theme-search-highlight-text": "#ffedd5",
      "--theme-home-glow-top": "rgba(126, 34, 206, 0.14)",
      "--theme-home-glow-bottom": "rgba(251, 146, 60, 0.07)",
      "--theme-home-nav-card-border": "rgba(251, 146, 60, 0.2)",
      "--theme-warning-bg": "#2b2208",
      "--theme-construction-banner-text": "#facc15",
      ...scrollThumbOverrides(55, 0.13),
    },
    {
      "--c-brand": "234 88 12",
      // Autumn-parchment light canvas (the near-white formula would read
      // plain; Halloween daylight is warm cider paper with plum ink).
      "--theme-body-bg": "oklch(96.5% 0.02 80)",
      "--theme-page-start": "oklch(96.9% 0.018 80)",
      "--theme-page-mid": "oklch(96.3% 0.021 80)",
      "--theme-page-end": "oklch(95.6% 0.023 80)",
      "--theme-panel-base": "oklch(93% 0.035 75)",
      "--theme-control-base": "oklch(92% 0.038 75)",
      "--theme-chrome-rail-base": "oklch(88% 0.045 70)",
      "--theme-chrome-surface": "oklch(88.5% 0.042 70)",
      "--theme-chrome-surface-strong": "oklch(84.5% 0.05 68)",
      "--theme-chrome-border": "oklch(46% 0.08 55 / 0.25)",
      "--theme-menu-surface": "oklch(90.5% 0.04 72)",
      "--site-logo-stop-3": "#7e22ce",
      // Orange-700 #c2410c measured 4.46:1 on this preset's own
      // --theme-surface-muted #fcebe0, below the 4.5:1 text floor; the heading
      // is small text in .theme-portal-group-heading, so the large-text
      // allowance does not apply. #c03f09 is the same orange (hue 38.4,
      // chroma 0.174 both unmoved) four tenths of a point of OKLCH lightness
      // darker, and measures 4.55:1 there.
      "--theme-section-heading": "#c03f09",
      "--theme-search-overlay-bg": "oklch(95% 0.03 75)",
      "--theme-search-highlight-bg": "#fbe4cf",
      "--theme-search-highlight-text": "#431407",
      "--theme-home-nav-card-border": "oklch(58% 0.12 55 / 0.16)",
      "--theme-report-substance-text": "#9a3412",
      "--theme-report-metadata-text": "#6d5346",
      // Orange-700 #c2410c measured 4.11:1 on this preset's own
      // --theme-report-phase-peak-bg #f1e2e3, below the 4.5:1 text floor.
      // #aa3a0b is the same orange one point of OKLCH lightness above
      // --theme-report-substance-text #9a3412 and measures 5.04:1 there.
      "--theme-report-phase-peak-text": "#aa3a0b",
      "--theme-avatar-gradient-from": "oklch(89% 0.05 70)",
      "--theme-avatar-gradient-to": "oklch(79% 0.09 300)",
      "--theme-home-glow-top": "rgba(126, 34, 206, 0.026)",
      "--theme-home-glow-bottom": "rgba(234, 88, 12, 0.024)",
      ...scrollThumbOverridesLight(55, 0.13),
    },
  ),
};

/** Holly green, crimson, and snow. The dark wordmark runs snow → mint →
 *  holly → crimson; light mode is snow-day paper with pale-green glass and
 *  crimson ink. Safety: the green brand re-seats success to teal (the
 *  Canopy treatment) and the festive crimson re-seats danger to
 *  magenta-pink (the Garnet treatment); caution amber doubles as the gold. */
export const yuletide: PalettePreset = {
  id: "yuletide",
  name: "Yuletide",
  tagline: "Holly green, crimson, and snow.",
  swatch: {
    dark: ["#030f09", "#0a2318", "#f0faf3", "#22c55e", "#dc2626"],
    light: ["#fbfdfb", "#e3f2e6", "#123024", "#15803d", "#b91c1c"],
  },
  overrides: split(
    {
      "--h-brand": "150",
      "--h-plum": "165",
      "--h-text": "170",
      "--h-violet": "25",
      "--theme-molecule-hue-rotate": "-152deg",
      "--c-accent": "220 252 231",
      "--c-violet": "220 38 38",
      "--c-violet-bright": "248 113 113",
      "--c-violet-deep": "153 27 27",
      "--c-plum-deep": "8 36 24",
      "--c-plum-pink": "190 18 60",
      "--c-fuchsia-200": "#dcfce7",
      "--c-fuchsia-400": "#86efac",
      "--c-fuchsia-600": "#15803d",
      "--c-fuchsia-700": "#166534",
      "--c-violet-200": "#fecaca",
      "--c-violet-700": "#991b1b",
      "--h-green": "185",
      "--c-emerald": "45 212 191",
      "--c-emerald-bright": "94 234 212",
      "--c-emerald-deep": "13 148 136",
      "--c-emerald-100": "#ccfbf1",
      "--c-emerald-200": "#99f6e4",
      "--c-emerald-700": "#0f766e",
      "--c-emerald-800": "#115e59",
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
      "--c-brand": "34 197 94",
      ...retunedDarkLiterals,
      "--theme-body-bg": "#030f09",
      "--theme-accent": "#a7f3d0",
      "--theme-panel-base": "#0a2318",
      "--theme-control-base": "oklch(23.5% 0.045 170)",
      "--theme-surface-soft": "#0c1f15",
      "--theme-surface-muted": "#102a1c",
      "--theme-surface-strong": "#07170f",
      "--theme-search-overlay-bg": "#0e2419",
      "--theme-search-highlight-bg": "#3f1a1f",
      "--theme-search-highlight-text": "#fecaca",
      "--theme-home-glow-top": "rgba(22, 101, 52, 0.14)",
      "--theme-home-glow-bottom": "rgba(220, 38, 38, 0.07)",
      // Crimson is co-primary, not an accent: red rims around the green
      // glass (wreath and berries), red glow behind the wordmark, pale-red
      // headings, red selection, candy-cane scrollbar.
      "--theme-card-border": "rgb(220 38 38 / 0.3)",
      "--theme-card-border-strong": "rgb(220 38 38 / 0.42)",
      "--theme-frosted-panel-border": "rgb(220 38 38 / 0.28)",
      "--theme-frosted-panel-hover-border": "rgb(220 38 38 / 0.4)",
      "--theme-frosted-control-border": "rgb(248 113 113 / 0.3)",
      "--theme-frosted-control-hover-border": "rgb(252 165 165 / 0.42)",
      "--theme-section-heading": "#fca5a5",
      "--theme-selection": "rgb(220 38 38 / 0.32)",
      "--theme-logo-shadow": "rgb(220 38 38 / 0.4)",
      "--theme-logo-shadow-hover": "rgb(220 38 38 / 0.48)",
      "--theme-home-nav-card-border": "rgba(220, 38, 38, 0.26)",
      "--theme-interaction-danger-card-primary": "#4d1531",
      "--theme-semantic-danger-badge-text": "rgb(251 207 232)",
      ...scrollThumbOverrides(25, 0.13),
    },
    {
      "--c-brand": "21 128 61",
      "--site-logo-stop-3": "#b91c1c",
      "--theme-section-heading": "#b91c1c",
      "--theme-search-overlay-bg": "oklch(96% 0.02 150)",
      "--theme-search-highlight-bg": "#f9dee3",
      "--theme-search-highlight-text": "#7f1d1d",
      "--theme-home-nav-card-border": "oklch(50% 0.14 25 / 0.2)",
      "--theme-card-border": "oklch(48% 0.13 25 / 0.22)",
      "--theme-card-border-strong": "oklch(45% 0.145 25 / 0.34)",
      "--theme-frosted-panel-border": "oklch(52% 0.12 25 / 0.18)",
      "--theme-frosted-panel-hover-border": "oklch(48% 0.13 25 / 0.24)",
      "--theme-frosted-control-border": "oklch(52% 0.12 25 / 0.2)",
      "--theme-frosted-control-hover-border": "oklch(47% 0.14 25 / 0.28)",
      "--theme-report-substance-text": "#166534",
      "--theme-report-metadata-text": "#4c6357",
      "--theme-report-phase-peak-text": "#be123c",
      "--theme-avatar-gradient-from": "oklch(89.5% 0.055 150)",
      "--theme-avatar-gradient-to": "oklch(80% 0.1 25)",
      "--theme-home-glow-top": "rgba(21, 128, 61, 0.028)",
      "--theme-home-glow-bottom": "rgba(185, 28, 28, 0.022)",
      ...scrollThumbOverridesLight(25, 0.14),
    },
  ),
};
