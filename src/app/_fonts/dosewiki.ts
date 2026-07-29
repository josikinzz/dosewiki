import localFont from "next/font/local";

/**
 * dose.wiki display/body face.
 *
 * Bound to `--font-display`, the one variable every downstream consumer reads:
 * `tailwind.config.mjs` (`font-display`), `--font-family-display` in
 * `src/styles/base.css`, and the Effect Index skin's `--font-family-body` override.
 * Nothing downstream has to know which flavor was built.
 *
 * Why this lives in its own module: `next/font` is an SWC *compile-time* transform and
 * every option value has to be a written literal, so the two flavors' faces cannot be
 * gated inside one module (`preload: !isEffectIndex` fails the build). Importing both
 * modules would not help either — the unused loader still emits its `@font-face` blocks
 * and its `<link rel="preload">` tags. So exactly one of these modules is resolved, via
 * the `@site-font` alias in `next.config.ts`. That is also what keeps the dose.wiki build
 * free of the `next/font/google` network fetch that the Effect Index face needs.
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
