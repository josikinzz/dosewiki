import type { PalettePreset, ThemeOverrideMap } from "./palettePresets";
import { getFontChoice } from "./paletteTokensFonts";
import { split } from "./presetRecipes";

/**
 * Letterpress — a Fun palette in the flat, printed register: warm paper,
 * near-black ink, a single deep teal, sharp corners, formal Titillium type, and
 * almost no depth. Its values are *read from* the Pro skin
 * (`src/styles/pro-theme.css` seeds like paper #f6f5f1 / ink #333 / teal
 * #3d9991, its 0.1875–0.375rem radii, its flattened elevations).
 *
 * It is not the Pro visual style and must not be presented as one. Pro is a
 * selectable style with its own stylesheet, typography and structure; this is a
 * palette the Theme Lab can edit, wearing Pro's colours over Fun's layout.
 *
 * The stored id stays `journal`. It is a saved value in editors' browsers, and
 * renaming it would silently retire every palette saved against it — only the
 * public label changed.
 *
 * Its dark register (charcoal chrome, muted ink-on-dark, the on-dark teal) is
 * this palette's own adaptation, sampled before Pro grew a dark scheme; the two
 * are close, but `pro-theme.css` is the authority for Pro.
 *
 * Deliberately excluded: Pro's layout, page structure, navigation composition,
 * and voice — this is a token bundle, not an impersonation.
 *
 * Kept as its own module so `palettePresets.ts` stays under its cleanup budget —
 * the same reason the other eleven colourways now sit in
 * `presetAccentColourways.ts` and `presetLabColourways.ts`. The preset registers
 * in `PALETTE_PRESETS` there like any other, and takes its `split` from the
 * shared `presetRecipes.ts` rather than keeping the local copy it carried while
 * there was nowhere shared to put it.
 */

const titillium = getFontChoice("titillium")!.stack;

/** The letterpress look carries almost no depth: functional shadows stay as
 *  faint ink washes, decorative lifts and glows go entirely. */
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
  // Frozen: this id is a saved value in editors' browsers. Only `name` and
  // `tagline` are the public label, and only they were renamed.
  id: "journal",
  name: "Letterpress",
  tagline: "Paper, ink, and one deep teal — flat and sharp.",
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
      // Letterpress wears its type formally: Titillium for body and display.
      "--font-family-body": titillium,
      "--font-family-display": titillium,
      // Sharp corners, straight from the Pro scale.
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
      // Journal's dark canvas #262626 is far lighter than the near-black the
      // other twelve colourways use, so the base sheet's dark heading
      // rgb(var(--c-accent)) — which this preset seeds to #3d9991 above —
      // lands under the floor on most of its own dark grounds: 4.44:1 on the
      // #262626 canvas, 4.21:1 on --theme-surface-soft #2a2a2a, 4.67:1 on
      // --theme-surface-strong #222222, and 3.76:1 on --theme-surface-muted
      // #323232. The floor is 4.5:1, not the 3:1 large-text allowance, because
      // .theme-portal-group-heading (utilities-theme.css:3966) also paints this
      // token at text-xs. #6fc4bb is this register's own --theme-accent and
      // --theme-accent-strong three lines up, so the heading keeps the base
      // dark sheet's relationship — there section-heading and --theme-accent
      // are the same colour — while measuring 7.42:1 / 7.03:1 / 7.80:1 on those
      // three grounds, floor 6.28:1 once #323232 is included. Same root cause
      // and same remedy as --theme-report-phase-peak-text below. The light
      // register keeps its own ink #333333.
      "--theme-section-heading": "#6fc4bb",
      "--theme-control-base": "oklch(30% 0.006 175)",
      "--theme-surface-soft": "#2a2a2a",
      "--theme-surface-muted": "#323232",
      "--theme-surface-strong": "#222222",
      "--theme-page-start": "#2b2b2b",
      "--theme-page-mid": "#262626",
      "--theme-chrome-rail-base": "oklch(24% 0.004 175)",
      "--theme-field-surface": "oklch(28% 0.005 175)",
      // Was pinned flat to the rail (ratio 1.000 — the field vanished into the
      // bar). Lifted to the Effect Index relationship this preset is modelled
      // on: #2e2e2e rail / #3a3a3a field, which in this palette is L29.5%.
      "--theme-field-on-chrome-surface": "oklch(29.5% 0.005 175)",
      "--theme-field-on-panel-surface": "oklch(27% 0.005 175)",
      "--theme-field-on-panel-surface-alt": "oklch(25% 0.005 175)",
      "--theme-article-neutral-panel-base": "oklch(29% 0.005 175)",
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
      // Journal's dark canvas is #262626, far lighter than the near-black every
      // other colourway uses, so the base sheet's dark peak ink
      // rgb(var(--c-accent)) #3d9991 collapses to 3.81:1 on the 8% brand wash
      // this preset resolves to, #2c3332. The preset's own dark brand teal
      // #6fc4bb measures 6.33:1 there. Only Journal needs this: the other
      // twelve colourways clear the 4.5:1 floor on their darker canvases.
      "--theme-report-phase-peak-text": "#6fc4bb",
    },
    {
      // Paper register: the skin's seeds, verbatim where a token maps 1:1.
      "--c-brand": "61 153 145",
      "--theme-body-bg": "#f6f5f1",
      "--theme-panel-base": "#fbfaf8",
      // Light accent family, moved down the teal ladder. The Pro seed #3d9991
      // (OKLCH L62.6% C0.087 H187.3) is a mid-lightness teal and journal's light
      // grounds are the lightest of the thirteen colourways, so as --theme-accent
      // it failed the 4.5:1 text floor on both cards themeRamp.contrast.test.ts
      // measures that token against: 3.14:1 on --theme-surface-soft #edf8f4 and
      // 3.23:1 on --theme-surface-strong #f1fbf8 (3.12:1 on the #f6f5f1 paper
      // canvas, which the pair list does not assert and which is no better).
      // #147a73 is the same teal ten OKLCH lightness points darker — L52.4%
      // C0.0866 H187.6, inside the 186.8-187.7 Effect Index teal band
      // lagoonPreset.ts measures — and reads 4.76:1 on #edf8f4, 4.90:1 on
      // #f1fbf8, 4.74:1 on the canvas. Its chroma sits under the sRGB ceiling at
      // that lightness (0.0915, binary-searched in OKLCH), so no channel clamps:
      // per lagoonPreset.ts's note on teal outside sRGB, clamping lightens the
      // result and would hand back the contrast this step buys.
      // --theme-accent-muted follows it down from #34837c (L55.9%) to #0a736c
      // (L50.1% C0.0852, ceiling 0.0872), so the family stays monotonic in
      // lightness — strong #27635d 45.9% < muted 50.1% < accent 52.4% < soft
      // #5cb3aa 71.0% — rather than leaving muted stranded above the base step.
      // On the same three grounds: strong 6.38:1 / 6.57:1 / 6.36:1, muted 5.25:1
      // / 5.40:1 / 5.23:1. Soft is a background wash and never ink (ReferenceList
      // mixes it at 18% behind a backlink), so it keeps its 2.28:1 and its value.
      // The dark register carries its own lighter #6fc4bb family above; #3d9991
      // stays the shared --c-accent seed, so the palette's identity is unmoved.
      "--theme-accent": "#147a73",
      "--theme-accent-strong": "#27635d",
      "--theme-accent-soft": "#5cb3aa",
      "--theme-accent-muted": "#0a736c",
      "--theme-control-base": "#efeee9",
      "--theme-page-start": "#f6f5f1",
      "--theme-page-mid": "#f6f5f1",
      "--theme-article-neutral-panel-base": "#fbfaf8",
      "--theme-card-border": "#dcdad3",
      "--theme-card-border-strong": "#c6c3ba",
      "--theme-frosted-panel-border": "#dcdad3",
      "--theme-frosted-panel-hover-border": "#c6c3ba",
      "--theme-frosted-control-border": "#dcdad3",
      "--theme-frosted-control-hover-border": "#c6c3ba",
      // WCAG 1.4.11, per the note on --theme-field-border in site-colors.css: the
      // shared #c6c3ba rim the four border tokens above wear is only 1.58:1
      // against this preset's light field fill #e6f6f1, so the field breaks off
      // the family and takes the same warm gray four steps down. #8b8880 is
      // 3.17:1 against that fill, 3.25:1 against the #f6f5f1 paper and 3.26:1
      // against a card; opaque like the rest of Journal, which also keeps it at
      // 4.11:1 over the dark L28% field fill a .theme-chrome-dark island wears in
      // light mode. Journal's dark half needs no override — the base sheet's
      // white/0.36 clears its lighter field at 3.19:1, the tightest of the 13
      // colourways.
      "--theme-field-border": "#8b8880",
      "--theme-selection": "rgba(61, 153, 145, 0.18)",
      "--theme-section-heading": "#333333",
      "--site-logo-stop-3": "#27635d",
      "--theme-search-overlay-bg": "#fbfaf8",
      "--theme-search-highlight-bg": "#e4e2db",
      "--theme-search-highlight-text": "#333333",
      "--theme-home-nav-card-border": "#dcdad3",
      "--theme-report-substance-text": "#27635d",
      "--theme-report-metadata-text": "#6b6b6b",
      // #34837c, the --theme-accent-muted this preset carried before the light
      // accent family moved down, measured 3.71:1 on its own
      // --theme-report-phase-peak-bg #e9eae6, the worst light peak pairing of
      // the thirteen colourways. #286d67 is the same teal seven points of OKLCH
      // lightness darker than that retired value, measures 5.00:1 there, and
      // stays three points above --theme-report-substance-text #27635d. It now
      // sits one OKLCH point below the current --theme-accent-muted #0a736c
      // (4.72:1 there), so the pin still gives the peak ink its own step.
      "--theme-report-phase-peak-text": "#286d67",
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
