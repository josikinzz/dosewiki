import localFont from "next/font/local";

/**
 * Effect Index display/body face — Titillium Web, the face the legacy Nuxt site loaded
 * from Google Fonts (`nuxt.config.ts` linked `Titillium+Web:400i,700,700i,400`).
 *
 * Self-hosted from the committed subsets in `public/fonts/titillium-web/` rather than
 * through `next/font/google`. Those files ARE that loader's output, kept in the repo (see
 * the README beside them), so the rendered face is unchanged; what goes away is a
 * build-time fetch of fonts.googleapis.com and, more importantly, the second copy. Both
 * publications can now render Pro, and a Google registration here plus the local Pro
 * registration in `./dosewiki.ts` would put the same typeface in this build twice under
 * two family names — one of them preloaded and then never painted, because
 * `pro-theme.css` binds its families to the Pro variable.
 *
 * Bound to the same `--font-display` variable as the dose.wiki face; see `./dosewiki.ts`
 * for why the two live in separate modules and how one is selected.
 */
export const siteFont = localFont({
  variable: "--font-display",
  display: "swap",
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
 * The Pro face for this build is the build's own face.
 *
 * Effect Index is locked to the Pro visual style, so Titillium is not optional here the
 * way it is on dose.wiki: it is what every page paints, and it keeps the preload that a
 * guaranteed face earns. Registering it a second time as `--font-pro` would emit a second
 * `@font-face` family and a second copy of the four woff2 files under a different hashed
 * name (`next/font` folds the preload flag into that name), and the preloaded copy would
 * be the one nothing renders.
 *
 * So this build defines no `--font-pro` at all, and `pro-theme.css` asks for it as
 * `var(--font-pro, var(--font-display))` — the fallback resolves to the face already
 * fetched. The alias keeps the two-name contract every consumer of `@site-font` relies on.
 */
export const proFont = siteFont;

/**
 * Effect Index sets body and display alike in Titillium: `pro-theme.css` re-seats
 * `--font-family-standard-body` to `--font-pro`, and this publication is locked to Pro, so
 * the Inter body face dose.wiki self-hosts would be an `@font-face` block, two preloads
 * and ~150 KB no element here ever resolves to. `base.css` asks for it as
 * `var(--font-body, Inter)`, so the missing variable costs nothing. The dose.wiki module
 * exports a real registration under the same name; the root layout only appends the
 * variable when this is non-null.
 */
export const bodyFont = null;
export const bodyItalicFace = null;

/**
 * Effect Index offers no font axis (`showFontToggle: false`), so this build
 * registers no Lexend face at all: a `localFont` call here would emit an `@font-face`
 * block and fallback metrics no selector on this publication can ever resolve. The
 * dose.wiki module exports a real registration under the same name; the root layout
 * only appends the variable when this is non-null.
 */
export const dyslexicFont = null;
