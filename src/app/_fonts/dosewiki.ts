import localFont from "next/font/local";

/**
 * dose.wiki's two faces: the Fun face it renders by default, and the Pro face it
 * renders only if a reader selects the Pro visual style.
 *
 * Why this lives in its own module: `next/font` is an SWC *compile-time* transform and
 * every option value has to be a written literal, so the two publications' faces cannot
 * be gated inside one module (`preload: !isEffectIndex` fails the build). Importing both
 * modules would not help either — the unused loader still emits its `@font-face` blocks
 * and its `<link rel="preload">` tags. So exactly one of these modules is resolved, via
 * the `@site-font` alias in `next.config.ts`, and both of them export the same two names.
 */

/**
 * Fun face. Bound to `--font-display`, the one variable every downstream consumer reads:
 * `tailwind.config.mjs` (`font-display`), `--font-family-display` in
 * `src/styles/base.css`. Nothing downstream has to know which flavor was built.
 */
export const siteFont = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    {
      path: "../../../public/fonts/Blinker-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../public/fonts/Blinker-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
});

/**
 * Pro face — Titillium Web, the typeface the Pro visual style is set in. Bound to
 * `--font-pro`, which `src/styles/pro-theme.css` reads for both family tokens.
 *
 * `preload: false` is the whole point of the separate registration. Pro is a reader
 * preference here, so the face is optional: without a preload link a browser fetches a
 * woff2 only when a rendered element actually resolves to it, which cannot happen while
 * the document is in Fun. A Fun reader pays nothing but the `@font-face` block.
 * `display: "swap"` plus `next/font`'s metric-matched fallback keeps the arrival of the
 * face from reflowing the page for the reader who does switch.
 *
 * These are the committed subsets `next/font/google` produced for the Effect Index build
 * (see `public/fonts/titillium-web/README.md`) — 400 normal, 400 italic, 600 normal and
 * 700 normal, which is the full set `base.css`'s `font-synthesis: none` requires the sheet
 * to have real faces for. The latin-ext splits beside them are not registered: `next/font`
 * has no per-source `unicode-range`, so a second subset in the same family would claim
 * the whole range and shadow the first. Codepoints outside latin fall back to the
 * metric-matched face, and the Theme Lab still serves both splits as static assets.
 */
export const proFont = localFont({
  variable: "--font-pro",
  display: "swap",
  preload: false,
  src: [
    {
      path: "../../../public/fonts/titillium-web/titillium-web-400-normal-latin.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../public/fonts/titillium-web/titillium-web-400-italic-latin.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../../public/fonts/titillium-web/titillium-web-600-normal-latin.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../../public/fonts/titillium-web/titillium-web-700-normal-latin.woff2",
      weight: "700",
      style: "normal",
    },
  ],
});

/**
 * Dyslexic-friendly face — Lexend, offered as a reader preference behind the
 * appearance popout's type toggle (`data-font="dyslexic"`, see
 * `src/styles/dyslexic-type.css`). Registered on the Pro face's terms:
 * `preload: false` plus `display: "swap"` means an untoggled reader pays only the
 * `@font-face` block — a woff2 is fetched the first time a rendered element
 * actually resolves to the family, which cannot happen until the toggle sets the
 * root attribute.
 *
 * One source, not four: Google serves Lexend as a single variable font (wght
 * 100–900), so the committed latin subset covers every weight the sheets ask
 * for — 400/600/700 under `font-synthesis: none` — in ~39 KB. Lexend has no
 * italic; with synthesis off, italic runs render upright in the same face,
 * which suits the toggle's whole purpose. See `public/fonts/lexend/README.md`.
 */
export const dyslexicFont = localFont({
  variable: "--font-dyslexic",
  display: "swap",
  preload: false,
  src: [
    {
      path: "../../../public/fonts/lexend/lexend-variable-normal-latin.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
});

/**
 * The picker's preview face — a 14-glyph subset of the face above carrying exactly
 * the "Dyslexic-friendly" option label (`--text="Dyslexic-friendly"`, regeneration
 * command in `public/fonts/lexend/README.md`). It exists so the appearance panel can
 * set that one label in the face the option selects: ~4 KB fetched only when the panel
 * first renders the picker, versus ~40 KB for the full face. Same registration terms —
 * `preload: false`, `display: "swap"` — so a reader who never opens the panel pays
 * nothing but the `@font-face` block.
 *
 * The subset is a label preview, not a second font axis: selecting the option still
 * loads the full face through `--font-dyslexic` on the root attribute's terms.
 */
export const dyslexicPreviewFont = localFont({
  variable: "--font-dyslexic-preview",
  display: "swap",
  preload: false,
  src: [
    {
      path: "../../../public/fonts/lexend/lexend-dyslexic-label-preview.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
});
