import { Titillium_Web } from "next/font/google";

/**
 * Effect Index display/body face — the face the legacy Nuxt site loaded from Google Fonts
 * (`nuxt.config.ts` linked `Titillium+Web:400i,700,700i,400`). `next/font/google`
 * self-hosts it at build time, so the published pages make no third-party request.
 *
 * Bound to the same `--font-display` variable as the dose.wiki face; see
 * `./dosewiki.ts` for why the two live in separate modules and how one is selected.
 */
export const siteFont = Titillium_Web({
  variable: "--font-display",
  display: "swap",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
});
