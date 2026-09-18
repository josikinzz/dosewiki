/**
 * dose.wiki style entry for the editor surface (dev.dose.wiki), resolved through the
 * `@site-styles` alias in `next.config.ts` when the build surface is `editor`.
 *
 * Everything the public entry ships, plus the dev tool chrome. Those classes are consumed
 * only under `src/features/dev`, whose modules exist only in the editor artifact, so the
 * public and Effect Index bundles never carry them. The sheet declares its rules inside
 * `@layer utilities`, the layer `src/styles/utilities-theme.css` already occupies, so
 * moving them here changed no cascade relationship with call-site Tailwind utilities.
 */
import "./dosewiki";
import "../../features/dev/dev-tools.css";
