/**
 * The faces a build can paint: `siteFont`, bound to `--font-display`, is the face the
 * publication renders by default; `bodyFont`, bound to `--font-body`, is the Inter
 * reading face under it (null on Effect Index, whose body face is its display face);
 * `proFont`, bound to `--font-pro`, is the face the Pro
 * visual style is set in; `dyslexicFont`, bound to `--font-dyslexic`, is Lexend —
 * dose.wiki's default reading face and the first font-picker option (null on Effect
 * Index, which locks the font axis and ships no Lexend bytes at all). The root layout
 * puts the variables on `<html>`, and `src/styles/pro-theme.css` /
 * `src/styles/font-type.css` decide what each mode reads.
 *
 * `@site-font` is a build-time alias resolved in `next.config.ts` to `./_fonts/dosewiki`
 * or `./_fonts/effectindex` from `NEXT_PUBLIC_SITE_FLAVOR`. Selecting the module (rather
 * than branching inside one) is forced by `next/font` being a compile-time transform
 * whose option values must be written literals, and it is what keeps each build down to
 * the faces it actually renders — no stray `@font-face` blocks, no stray preload links,
 * and no duplicate registration of Titillium on the publication that already ships it as
 * its own face.
 *
 * `tsconfig.json` maps `@site-font` to the dose.wiki module so `tsc` and editors have a
 * shape to check against; both modules export the same names.
 */
export { bodyFont, bodyItalicFace, dyslexicFont, proFont, siteFont } from "@site-font";
