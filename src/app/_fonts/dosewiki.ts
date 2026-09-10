import localFont from "next/font/local";

/**
 * dose.wiki's faces: the Fun display face it renders by default, the Inter body face
 * under it, and the Pro face it renders only if a reader selects the Pro visual style.
 *
 * Why this lives in its own module: `next/font` is an SWC *compile-time* transform and
 * every option value has to be a written literal, so the two publications' faces cannot
 * be gated inside one module (`preload: !isEffectIndex` fails the build). Importing both
 * modules would not help either — the unused loader still emits its `@font-face` blocks
 * and its `<link rel="preload">` tags. So exactly one of these modules is resolved, via
 * the `@site-font` alias in `next.config.ts`, and both of them export the same names.
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
 * Body face. Inter has headed `--font-family-standard-body` in `src/styles/base.css`
 * since the start, but only as a name: nothing served it, so a reader without Inter
 * installed (Firefox on Linux or Windows, most of all) fell through to `system-ui` and
 * read the site in whatever sans the OS ships. This registration binds the committed
 * files to `--font-body`, which that stack now leads with, so every platform gets the
 * same reading face. Preloaded, on the display face's reasoning: it paints on every page.
 *
 * Two sources, one family: Google serves Inter 4 as an upright and an italic VARIABLE
 * font (`wght` 100 to 900, `opsz` 14 to 32), so every weight and both slopes the sheets
 * ask for under `base.css`'s `font-synthesis: none` have a real face. See
 * `public/fonts/inter/README.md` for provenance and the OFL beside it.
 */
export const bodyFont = localFont({
  variable: "--font-body",
  display: "swap",
  src: [
    {
      path: "../../../public/fonts/inter/inter-variable-normal-latin.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../../../public/fonts/inter/inter-variable-italic-latin.woff2",
      weight: "100 900",
      style: "italic",
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
 * The default reading face — Lexend, the face every dose.wiki reader opens on
 * (`data-font` absent, see `src/styles/font-type.css`) and the first option in the
 * appearance popout's font picker. Registered on the body face's terms: `preload: true`
 * (the default, written out because it is the whole point) plus `display: "swap"` — it
 * paints on every page, so it carries the same preload the Inter body face does.
 *
 * One source, not four: Google serves Lexend as a single variable font (wght
 * 100–900), so the committed latin subset covers every weight the sheets ask
 * for — 400/600/700 under `font-synthesis: none` — in ~39 KB. Lexend has no
 * italic; with synthesis off, italic runs render upright in the same face.
 * See `public/fonts/lexend/README.md`.
 */
export const dyslexicFont = localFont({
  variable: "--font-dyslexic",
  display: "swap",
  preload: true,
  src: [
    {
      path: "../../../public/fonts/lexend/lexend-variable-normal-latin.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
});
