import type { PalettePreset, PresetOverrides, ThemeOverrideMap } from "./palettePresets";
import { getFontChoice } from "./paletteTokensFonts";

/**
 * Journal — the Effect Index aesthetic worn by dosewiki: warm paper, near-black
 * ink, a single deep teal, sharp corners, formal Titillium type, and almost no
 * depth. Values are *read from* the Effect Index skin (`effectindex-theme.css`
 * seeds like paper #f6f5f1 / ink #333 / teal #3d9991, its 0.1875–0.375rem
 * radii, its flattened elevations); the skin itself is untouched and the
 * Effect Index flavor never renders through this preset.
 *
 * Deliberately excluded: Effect Index layout, page structure, navigation
 * composition, and voice — this is a token bundle, dosewiki wearing the
 * sibling's flavor, not an impersonation of the site.
 *
 * Dark mode has no Effect Index original (that site is light-locked), so it is
 * an adaptation in the same register: charcoal chrome, muted ink-on-dark, the
 * skin's own on-dark teal — restrained rather than inventive.
 *
 * Kept as a sibling module so `palettePresets.ts` stays under its cleanup
 * budget; the preset registers in `PALETTE_PRESETS` there like any other.
 */

const titillium = getFontChoice("titillium")!.stack;

function split(
  shared: ThemeOverrideMap,
  dark: ThemeOverrideMap,
  light: ThemeOverrideMap,
): PresetOverrides {
  return { dark: { ...shared, ...dark }, light: { ...shared, ...light } };
}

/** The journal look carries almost no depth: functional shadows stay as faint
 *  ink washes, decorative lifts and glows go entirely. */
const FLAT_ELEVATIONS: ThemeOverrideMap = {
  "--theme-elevation-sm": "0 1px 2px 0 rgb(51 51 51 / 0.06)",
  "--theme-elevation-lg": "0 2px 6px -1px rgb(51 51 51 / 0.08)",
  "--theme-elevation-xl": "0 3px 8px -2px rgb(51 51 51 / 0.1)",
  "--theme-elevation-2xl": "0 4px 10px -3px rgb(51 51 51 / 0.12)",
  "--theme-elevation-inner": "inset 0 1px 2px 0 rgb(51 51 51 / 0.05)",
  "--theme-elevation-card": "0 1px 3px 0 rgb(51 51 51 / 0.08)",
  "--theme-elevation-card-subtle": "0 1px 2px 0 rgb(51 51 51 / 0.06)",
  "--theme-elevation-overlay": "0 4px 12px -2px rgb(51 51 51 / 0.14)",
  "--theme-elevation-panel": "0 1px 3px 0 rgb(51 51 51 / 0.08)",
  "--theme-elevation-panel-deep": "0 2px 6px -1px rgb(51 51 51 / 0.1)",
  "--theme-elevation-tile-hover": "0 2px 6px -1px rgb(51 51 51 / 0.1)",
  "--theme-elevation-motion-card": "0 1px 3px 0 rgb(51 51 51 / 0.08)",
  "--theme-elevation-motion-card-hover": "0 2px 6px -1px rgb(51 51 51 / 0.1)",
  "--theme-elevation-swatch": "0 1px 2px 0 rgb(51 51 51 / 0.08)",
  "--theme-elevation-accent-lift": "0 0 #0000",
  "--theme-elevation-danger": "0 1px 3px 0 rgb(51 51 51 / 0.08)",
  "--theme-elevation-danger-hover": "0 2px 6px -1px rgb(51 51 51 / 0.1)",
  "--theme-elevation-control-active": "0 0 #0000",
  "--theme-elevation-control-primary": "0 0 #0000",
  "--theme-elevation-icon-tile": "0 0 #0000",
  "--theme-elevation-top-highlight": "0 0 #0000",
  "--theme-elevation-top-highlight-faint": "0 0 #0000",
  "--theme-elevation-avatar-inner": "0 0 #0000",
  "--theme-elevation-avatar-glow": "0 0 #0000",
};

export const journal: PalettePreset = {
  id: "journal",
  name: "Journal",
  tagline: "Paper, ink, and one deep teal — the formal register, flat and sharp.",
  swatch: {
    dark: ["#262626", "#2e2e2e", "#f2f2f0", "#8a8a8a", "#6fc4bb"],
    light: ["#f6f5f1", "#fbfaf8", "#333333", "#6b6b6b", "#3d9991"],
  },
  overrides: split(
    {
      // Teal-seated derivation, chroma pinned low so surfaces stay warm-grey
      // paper rather than mint (the Graphite lesson: hue-driving alone reads
      // as a vividly tinted theme).
      "--h-brand": "175",
      "--h-plum": "175",
      "--h-text": "175",
      "--h-violet": "175",
      "--theme-molecule-saturate": "0.2",
      "--c-accent": "61 153 145",
      "--c-violet": "107 138 134",
      "--c-violet-bright": "111 196 187",
      "--c-violet-deep": "39 99 93",
      "--c-plum-deep": "24 30 29",
      "--c-plum-pink": "82 107 103",
      "--c-fuchsia-200": "#c9e2df",
      "--c-fuchsia-400": "#6fc4bb",
      "--c-fuchsia-600": "#34837c",
      "--c-fuchsia-700": "#27635d",
      "--c-violet-200": "#d5e5e3",
      "--c-violet-700": "#1f4a45",
      // The journal wears its type formally: Titillium for body and display.
      "--font-family-body": titillium,
      "--font-family-display": titillium,
      // Sharp corners, straight from the Effect Index scale.
      "--radius": "0.375rem",
      "--radius-xl": "0.25rem",
      "--radius-2xl": "0.375rem",
      "--radius-3xl": "0.375rem",
      // Flat: faint functional shadows, no decorative lift, no frosted blur.
      ...FLAT_ELEVATIONS,
      "--theme-backdrop-blur": "off",
      "--theme-elevation-mark-hairline":
        "inset 0 0 0 1px color-mix(in srgb, #3d9991 34%, transparent)",
    },
    {
      // Charcoal register: the skin's own on-dark ramp.
      "--c-brand": "111 196 187",
      "--theme-body-bg": "#262626",
      "--theme-panel-base": "#2e2e2e",
      "--theme-accent": "#6fc4bb",
      "--theme-accent-strong": "#6fc4bb",
      "--theme-accent-soft": "#8ed0c9",
      "--theme-accent-muted": "#58a89f",
      "--theme-control-base": "oklch(30% 0.006 175)",
      "--theme-surface-soft": "#2a2a2a",
      "--theme-surface-muted": "#323232",
      "--theme-surface-strong": "#222222",
      "--theme-page-start": "#2b2b2b",
      "--theme-page-mid": "#262626",
      "--theme-chrome-rail-base": "oklch(24% 0.004 175)",
      "--theme-field-surface": "oklch(28% 0.005 175)",
      "--theme-field-on-chrome-surface": "oklch(24% 0.004 175)",
      "--theme-field-on-panel-surface": "oklch(27% 0.005 175)",
      "--theme-field-on-panel-surface-alt": "oklch(25% 0.005 175)",
      "--theme-article-neutral-panel-base": "oklch(29% 0.005 175)",
      "--theme-route-active-base": "oklch(38% 0.01 175)",
      "--theme-header-nav-active-bg": "oklch(32% 0.008 175)",
      "--theme-search-overlay-bg": "#2e2e2e",
      "--theme-search-highlight-bg": "#3a3a3a",
      "--theme-search-highlight-text": "#f2f2f0",
      "--theme-home-glow-top": "rgba(111, 196, 187, 0.05)",
      "--theme-home-glow-bottom": "rgba(111, 196, 187, 0.03)",
      "--theme-home-nav-card-border": "rgba(111, 196, 187, 0.18)",
      "--theme-page-halo-top": "transparent",
      "--theme-page-halo-left": "transparent",
      "--theme-page-halo-right": "transparent",
    },
    {
      // Paper register: the skin's seeds, verbatim where a token maps 1:1.
      "--c-brand": "61 153 145",
      "--theme-body-bg": "#f6f5f1",
      "--theme-panel-base": "#fbfaf8",
      "--theme-accent": "#3d9991",
      "--theme-accent-strong": "#27635d",
      "--theme-accent-soft": "#5cb3aa",
      "--theme-accent-muted": "#34837c",
      "--theme-control-base": "#efeee9",
      "--theme-page-start": "#f6f5f1",
      "--theme-page-mid": "#f6f5f1",
      "--theme-article-neutral-panel-base": "#fbfaf8",
      "--theme-route-active-base": "oklch(94% 0.012 175)",
      "--theme-article-route-active-text": "#27635d",
      "--theme-card-border": "#dcdad3",
      "--theme-card-border-strong": "#c6c3ba",
      "--theme-frosted-panel-border": "#dcdad3",
      "--theme-frosted-panel-hover-border": "#c6c3ba",
      "--theme-frosted-control-border": "#dcdad3",
      "--theme-frosted-control-hover-border": "#c6c3ba",
      "--theme-field-border": "#c6c3ba",
      "--theme-selection": "rgba(61, 153, 145, 0.18)",
      "--theme-section-heading": "#333333",
      "--site-logo-stop-3": "#27635d",
      "--theme-search-overlay-bg": "#fbfaf8",
      "--theme-search-highlight-bg": "#e4e2db",
      "--theme-search-highlight-text": "#333333",
      "--theme-home-nav-card-border": "#dcdad3",
      "--theme-report-substance-text": "#27635d",
      "--theme-report-metadata-text": "#6b6b6b",
      "--theme-report-phase-peak-text": "#34837c",
      "--theme-avatar-gradient-from": "#efeee9",
      "--theme-avatar-gradient-to": "#e4e2db",
      "--theme-home-glow-top": "rgba(61, 153, 145, 0.03)",
      "--theme-home-glow-bottom": "rgba(61, 153, 145, 0.02)",
      "--theme-page-halo-top": "transparent",
      "--theme-page-halo-left": "transparent",
      "--theme-page-halo-right": "transparent",
    },
  ),
};
