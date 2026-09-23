/**
 * Which substance priority tiers a build prerenders, keyed by locale and by
 * the artifact being built. Pure: the environment is read by the caller.
 *
 * The table is exhaustive over the locale registry on purpose. Adding a locale
 * to `content/i18n/localeRegistry.json` fails typecheck here until the new
 * mirror's prerender cost has been decided, rather than silently inheriting
 * the English list.
 */
import type { LocaleCode } from "../../src/i18n/localeRegistry.mjs";
import type { SiteFlavor } from "../../src/config/siteFlavor";
import type { BuildSurface } from "../../scripts/build/build-surface.mjs";

export type SubstancePrerenderPriority = "high" | "normal" | "low";

export type PrerenderBuild = {
  surface: BuildSurface;
  flavor: SiteFlavor;
};

export type PrerenderPolicy = readonly SubstancePrerenderPriority[];

const ALL_TIERS: PrerenderPolicy = Object.freeze(["high", "normal", "low"]);

/**
 * Substance tiers prerendered by the public dose.wiki artifact, per locale.
 * Every other artifact (editor, Effect Index) is decided below the table.
 */
const PUBLIC_DOSEWIKI_POLICY: Readonly<Record<LocaleCode, PrerenderPolicy>> = Object.freeze({
  en: ALL_TIERS,
  "zh-Hans": ALL_TIERS,
  ru: ALL_TIERS,
  nl: ALL_TIERS,
});

export function resolvePrerenderPolicy(locale: LocaleCode, build: PrerenderBuild): PrerenderPolicy {
  if (build.surface === "editor" || build.flavor === "effectindex") {
    return ALL_TIERS;
  }
  return PUBLIC_DOSEWIKI_POLICY[locale] ?? ALL_TIERS;
}
