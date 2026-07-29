/**
 * The display/body face this build renders with, bound to `--font-display`.
 *
 * `@site-font` is a build-time alias resolved in `next.config.ts` to `./_fonts/dosewiki`
 * or `./_fonts/effectindex` from `NEXT_PUBLIC_SITE_FLAVOR`. Selecting the module (rather
 * than branching inside one) is forced by `next/font` being a compile-time transform
 * whose option values must be written literals, and it is what keeps each build down to
 * the face it actually renders — no stray `@font-face` blocks, no stray preload links,
 * and no `next/font/google` fetch in the dose.wiki build.
 *
 * `tsconfig.json` maps `@site-font` to the dose.wiki module so `tsc` and editors have a
 * shape to check against; both modules export the same `siteFont`.
 */
export { siteFont } from "@site-font";
