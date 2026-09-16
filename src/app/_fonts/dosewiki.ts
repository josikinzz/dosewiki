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
 * Only upright is preloaded. The matching real italic face is registered in the
 * document head under the same generated family, so CSS fetches it on use without
 * introducing a second body family or synthesizing italics.
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
  ],
});

export const bodyItalicFace = `@font-face{font-family:${bodyFont.style.fontFamily.split(",")[0]};src:url("/fonts/inter/inter-variable-italic-latin.woff2") format("woff2");font-style:italic;font-weight:100 900;font-display:swap;}`;

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
 * The dyslexia-friendly reading face — Lexend, offered in the appearance popout's font
 * picker and painted only for a reader who chooses it (`data-font="lexend"`, see
 * `src/styles/font-type.css`). Registered on the Pro face's terms rather than the body
 * face's: `preload: false`, because the face is a reader preference, not something every
 * page paints, so an unchoosing reader downloads none of it. The retired binary toggle's
 * stored value migrates onto this face, so the readers who had it keep it.
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
  preload: false,
  src: [
    {
      path: "../../../public/fonts/lexend/lexend-variable-normal-latin.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
});
