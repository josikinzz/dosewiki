/**
 * Palette Lab preset palettes.
 *
 * A preset is a named pair of override maps — one per theme — in exactly the
 * shape the lab already injects (`html[data-theme="…"] { token: value }`) and
 * persists. Applying a preset therefore needs no new rendering machinery: the
 * lab merges `preset.overrides` under the user's own edits and writes the
 * result through the existing style tag.
 *
 * Authoring model: most of `site-colors.css` derives from the primitive
 * channel seeds (`--c-*`) and OKLCH hue-angle seeds (`--h-*`), so a preset
 * mostly re-seats those and then pins the short list of hard-coded literal
 * tokens (dark panel/control bases, search overlay, report bylines, the
 * light logo stop 3, avatar gradient, …). Hue-angle tokens are not in the
 * lab's editable registry but are legal CSS custom properties to override;
 * `PRESET_HUE_TOKEN_IDS` whitelists them for the definition tests.
 *
 * Safety constraint (see site-colors.css): the harm-reduction ramp
 * (success / caution / unsafe / danger / info) must stay clearly distinct
 * from each preset's brand accent. Presets whose brand sits on a safety hue
 * re-seat that family — documented per preset below.
 */

export type PresetThemeName = "dark" | "light";
export type ThemeOverrideMap = Record<string, string>;

/**
 * Override maps keyed by theme name ("dark" / "light"). Structurally the same
 * shape as the lab's own `Overrides` record (whose key type is the app-wide
 * ThemeName, a string), so presets and user edits merge without casts. The
 * definition tests enforce that every preset carries both theme keys.
 */
export type PresetOverrides = Record<string, ThemeOverrideMap>;

export type PalettePresetId =
  | "orchid"
  | "abyss"
  | "twilight"
  | "graphite"
  | "parchment"
  | "canopy"
  | "garnet"
  | "sunset"
  | "liberty";

export interface PalettePreset {
  id: PalettePresetId;
  name: string;
  tagline: string;
  /** Five representative hexes per theme (canvas, panel, text, brand, accent)
   *  for the picker swatch strips. Display-only. */
  swatch: { dark: string[]; light: string[] };
  overrides: PresetOverrides;
}

export const DEFAULT_PRESET_ID: PalettePresetId = "orchid";

/** Hue-angle seeds presets may override in addition to registry tokens. */
export const PRESET_HUE_TOKEN_IDS: readonly string[] = [
  "--h-brand",
  "--h-plum",
  "--h-text",
  "--h-violet",
  "--h-green",
  "--h-blue",
  "--h-rose",
  "--h-gold",
  "--h-orange",
];

/** Shared entries land in both themes; theme maps win on conflicts. */
function split(
  shared: ThemeOverrideMap,
  dark: ThemeOverrideMap,
  light: ThemeOverrideMap,
): PresetOverrides {
  return { dark: { ...shared, ...dark }, light: { ...shared, ...light } };
}

/** Merge override sets per theme; `extra` (the user's edits) wins per token. */
export function mergeOverrides(base: PresetOverrides, extra: PresetOverrides): PresetOverrides {
  return {
    dark: { ...base.dark, ...extra.dark },
    light: { ...base.light, ...extra.light },
  };
}

/**
 * The authored scrollbar thumb gradients hard-code fuchsia oklch stops, so
 * every alternate palette re-derives them from its own hue. Mirrors the
 * stock recipes (frosted pill in a channel, highlight at 12% 0%), scaled to
 * the preset's chroma.
 */
function scrollThumbOverrides(hue: number, chroma: number): ThemeOverrideMap {
  const c = (scale: number) => (chroma * scale).toFixed(3);
  return {
    "--theme-scroll-thumb-bg": `radial-gradient(circle at 12% 0%, color-mix(in srgb, oklch(76% ${c(1)} ${hue}) 66%, var(--theme-scroll-track)), color-mix(in srgb, oklch(62% ${c(1.3)} ${hue}) 50%, var(--theme-scroll-track)) 42%), linear-gradient(135deg, color-mix(in srgb, oklch(62% ${c(1.3)} ${hue}) 50%, var(--theme-scroll-track)), color-mix(in srgb, oklch(50% ${c(1.1)} ${hue}) 40%, var(--theme-scroll-track)))`,
    "--theme-scroll-thumb-hover-bg": `radial-gradient(circle at 12% 0%, color-mix(in srgb, oklch(82% ${c(0.9)} ${hue}) 82%, var(--theme-scroll-track)), color-mix(in srgb, oklch(68% ${c(1.35)} ${hue}) 64%, var(--theme-scroll-track)) 42%), linear-gradient(135deg, color-mix(in srgb, oklch(68% ${c(1.35)} ${hue}) 64%, var(--theme-scroll-track)), color-mix(in srgb, oklch(56% ${c(1.2)} ${hue}) 52%, var(--theme-scroll-track)))`,
  };
}

function scrollThumbOverridesLight(hue: number, chroma: number): ThemeOverrideMap {
  const c = chroma.toFixed(3);
  return {
    "--theme-scroll-thumb-bg": `radial-gradient(circle at 12% 0%, color-mix(in srgb, oklch(72% ${c} ${hue}) 64%, var(--theme-scroll-track)), color-mix(in srgb, oklch(54% ${c} ${hue}) 50%, var(--theme-scroll-track)) 42%), linear-gradient(135deg, color-mix(in srgb, oklch(54% ${c} ${hue}) 50%, var(--theme-scroll-track)), color-mix(in srgb, oklch(46% ${c} ${hue}) 42%, var(--theme-scroll-track)))`,
    "--theme-scroll-thumb-hover-bg": `radial-gradient(circle at 12% 0%, color-mix(in srgb, oklch(76% ${c} ${hue}) 78%, var(--theme-scroll-track)), color-mix(in srgb, oklch(50% ${c} ${hue}) 64%, var(--theme-scroll-track)) 42%), linear-gradient(135deg, color-mix(in srgb, oklch(50% ${c} ${hue}) 64%, var(--theme-scroll-track)), color-mix(in srgb, oklch(42% ${c} ${hue}) 54%, var(--theme-scroll-track)))`,
  };
}

/* ------------------------------------------------------------------------- */

/** The shipped fuchsia/plum look — zero overrides; the authored CSS as-is. */
const orchid: PalettePreset = {
  id: "orchid",
  name: "Orchid",
  tagline: "The shipped look — neon fuchsia over black plum glass.",
  swatch: {
    dark: ["#000000", "#1f0826", "#ffffff", "#d946ef", "#f0abfc"],
    light: ["#fdfcfd", "#f6e6f4", "#3c2144", "#a827b8", "#c026d3"],
  },
  overrides: { dark: {}, light: {} },
};

/** Bioluminescent cyan over deep ocean navy; seafoam paper by day.
 *  Safety: success re-seats toward yellow-green and info toward periwinkle so
 *  neither blurs into the cyan brand. */
const abyss: PalettePreset = {
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
      "--theme-molecule-hue-rotate": "-105deg",
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
      "--theme-home-nav-card-border": "rgba(34, 211, 238, 0.18)",
      ...scrollThumbOverrides(215, 0.13),
    },
    {
      "--c-brand": "8 145 178",
      "--theme-section-heading": "#0e7490",
      ...scrollThumbOverridesLight(215, 0.14),
      "--site-logo-stop-3": "#155e75",
      "--theme-search-overlay-bg": "oklch(96% 0.025 220)",
      "--theme-search-highlight-bg": "#d8f6fc",
      "--theme-search-highlight-text": "#083344",
      "--theme-home-nav-card-border": "oklch(58% 0.1 220 / 0.14)",
      "--theme-report-substance-text": "#155e75",
      "--theme-report-metadata-text": "#456575",
      "--theme-report-phase-peak-text": "#0e7490",
      "--theme-avatar-gradient-from": "oklch(89.5% 0.06 220)",
      "--theme-avatar-gradient-to": "oklch(80.5% 0.09 230)",
    },
  ),
};

/** Periwinkle indigo over blue-violet dusk; lavender-white paper.
 *  Safety: info re-seats to cyan so informational chips separate from the
 *  indigo brand. */
const twilight: PalettePreset = {
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
    },
  ),
};

/** Achromatic moon-silver; the safety ramp becomes the only color on the page.
 *  Safety: untouched — that's the point. */
const graphite: PalettePreset = {
  id: "graphite",
  name: "Graphite",
  tagline: "Achromatic moon-silver — safety colors carry all the chroma.",
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
      "--theme-molecule-saturate": "0.05",
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
      "--theme-home-nav-card-border": "rgba(154, 167, 184, 0.18)",
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
      "--theme-route-active-base": "oklch(96% 0.007 250)",
      "--theme-article-route-active-text": "oklch(38% 0.03 250)",
      "--theme-card-border": "oklch(48% 0.03 250 / 0.2)",
      "--theme-card-border-strong": "oklch(45% 0.035 250 / 0.32)",
      "--theme-frosted-panel-border": "oklch(58% 0.02 250 / 0.16)",
      "--theme-frosted-panel-hover-border": "oklch(50% 0.03 250 / 0.22)",
      "--theme-frosted-control-border": "oklch(58% 0.02 250 / 0.18)",
      "--theme-frosted-control-hover-border": "oklch(47% 0.03 250 / 0.26)",
      "--theme-field-border": "oklch(50% 0.025 250 / 0.3)",
      "--theme-selection": "oklch(50% 0.03 250 / 0.18)",
      "--theme-section-heading": "#47535f",
      ...scrollThumbOverridesLight(250, 0.02),
      "--site-logo-stop-3": "#334155",
      "--theme-search-overlay-bg": "oklch(96% 0.006 250)",
      "--theme-search-highlight-bg": "#e4e7ea",
      "--theme-search-highlight-text": "#1e242c",
      "--theme-home-nav-card-border": "oklch(58% 0.02 250 / 0.14)",
      "--theme-report-substance-text": "#334155",
      "--theme-report-metadata-text": "#565b64",
      "--theme-report-phase-peak-text": "#475569",
      "--theme-avatar-gradient-from": "oklch(89.5% 0.012 250)",
      "--theme-avatar-gradient-to": "oklch(80.5% 0.02 250)",
    },
  ),
};

/** Light-first: mulberry ink on warm sepia paper; candlelit cocoa after dark.
 *  Safety: caution amber deepens for contrast on cream panels. The light
 *  canvas is re-skinned explicitly (warm paper, not the hue-tinted white). */
const parchment: PalettePreset = {
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
    },
  ),
};

/** Leaf green and moss under a forest canopy; fern-and-cream paper by day.
 *  Safety: success re-seats from emerald to teal so "safe" callouts never
 *  blur into the leaf-green brand. The violet selected/info role is kept. */
const canopy: PalettePreset = {
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
      "--theme-molecule-hue-rotate": "-152deg",
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
      "--theme-home-nav-card-border": "rgba(74, 222, 128, 0.18)",
      ...scrollThumbOverrides(150, 0.11),
    },
    {
      "--c-brand": "21 128 61",
      "--theme-section-heading": "#15803d",
      ...scrollThumbOverridesLight(150, 0.12),
      "--site-logo-stop-3": "#166534",
      "--theme-search-overlay-bg": "oklch(96% 0.025 150)",
      "--theme-search-highlight-bg": "#d9f5e2",
      "--theme-search-highlight-text": "#14532d",
      "--theme-home-nav-card-border": "oklch(58% 0.09 150 / 0.14)",
      "--theme-report-substance-text": "#166534",
      "--theme-report-metadata-text": "#43604d",
      "--theme-report-phase-peak-text": "#15803d",
      "--theme-avatar-gradient-from": "oklch(89.5% 0.06 150)",
      "--theme-avatar-gradient-to": "oklch(80.5% 0.09 155)",
    },
  ),
};

/** Scarlet on black cherry; a quieter claret-on-porcelain by day.
 *  Safety (the trickiest preset): danger re-seats from rose toward vivid
 *  magenta-pink so alarms differ from the scarlet brand by hue, not just
 *  intensity. Unsafe orange is untouched — verify scarlet-vs-orange
 *  adjacency on interaction cards when tuning this preset. */
const garnet: PalettePreset = {
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
      "--theme-molecule-hue-rotate": "68deg",
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
      "--theme-home-nav-card-border": "rgba(248, 113, 113, 0.18)",
      "--theme-interaction-danger-card-primary": "#4d1531",
      "--theme-semantic-danger-badge-text": "rgb(251 207 232)",
      ...scrollThumbOverrides(25, 0.13),
    },
    {
      "--c-brand": "185 28 28",
      "--theme-section-heading": "#b91c1c",
      ...scrollThumbOverridesLight(25, 0.14),
      "--site-logo-stop-3": "#991b1b",
      "--theme-search-overlay-bg": "oklch(96% 0.02 25)",
      "--theme-search-highlight-bg": "#f8dfe0",
      "--theme-search-highlight-text": "#47191d",
      "--theme-home-nav-card-border": "oklch(55% 0.12 25 / 0.15)",
      "--theme-report-substance-text": "#991b1b",
      "--theme-report-metadata-text": "#664c50",
      "--theme-report-phase-peak-text": "#b91c1c",
      "--theme-avatar-gradient-from": "oklch(89.5% 0.05 25)",
      "--theme-avatar-gradient-to": "oklch(80.5% 0.08 20)",
    },
  ),
};

/** Coral horizon over dusk violet; golden-hour paper in light mode. The logo
 *  gradient becomes the actual sunset: gold → coral → rose → dusk violet.
 *  Safety: caution re-seats to pure gold and unsafe deepens to burnt
 *  vermilion so brand coral, gold caution, and burnt-orange unsafe stay
 *  three distinct steps. */
const sunset: PalettePreset = {
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
      "--theme-molecule-hue-rotate": "80deg",
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
      "--site-logo-stop-3": "#8f3a6b",
      "--theme-search-overlay-bg": "oklch(96% 0.025 340)",
      "--theme-search-highlight-bg": "#fbe3d5",
      "--theme-search-highlight-text": "#4a1a2e",
      "--theme-home-nav-card-border": "oklch(58% 0.1 40 / 0.15)",
      "--theme-report-substance-text": "#9c2c47",
      "--theme-report-metadata-text": "#5f4658",
      "--theme-report-phase-peak-text": "#b83a52",
      "--theme-avatar-gradient-from": "oklch(90% 0.05 60)",
      "--theme-avatar-gradient-to": "oklch(80% 0.09 345)",
    },
  ),
};

/** Red, white, and blue: red glow and blue glass over midnight navy; crisp
 *  federal paper with red-and-navy ink by day. The dark wordmark runs pale
 *  blue → white → red → blue. Safety: a red brand collides with danger rose,
 *  so danger re-seats to magenta-pink (the Garnet treatment); the blue
 *  selected/info role is the palette's second color. */
const liberty: PalettePreset = {
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
      "--h-violet": "260",
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
      "--c-fuchsia-700": "#b91c1c",
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
      ...scrollThumbOverridesLight(25, 0.14),
    },
  ),
};

/* ------------------------------------------------------------------------- */

export const PALETTE_PRESETS: PalettePreset[] = [
  orchid,
  abyss,
  twilight,
  graphite,
  parchment,
  canopy,
  garnet,
  sunset,
  liberty,
];

const PRESET_BY_ID = new Map<string, PalettePreset>(
  PALETTE_PRESETS.map((preset) => [preset.id, preset]),
);

export function isKnownPresetId(id: string | null | undefined): id is PalettePresetId {
  return typeof id === "string" && PRESET_BY_ID.has(id);
}

/** Resolve a preset id from storage; unknown / missing ids degrade to the
 *  default so a renamed or removed preset never errors. */
export function getPreset(id: string | null | undefined): PalettePreset {
  return (isKnownPresetId(id) ? PRESET_BY_ID.get(id) : undefined) ?? orchid;
}
