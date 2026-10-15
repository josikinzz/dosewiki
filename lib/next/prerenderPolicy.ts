import type { LocaleCode } from "../../src/i18n/localeRegistry.mjs";
import type { SiteFlavor } from "../../src/config/siteFlavor";
import type { BuildSurface } from "../../scripts/build/build-surface.mjs";

export type SubstancePrerenderPriority = "high" | "normal" | "low";

export type PrerenderBuild = {
  surface: BuildSurface;
  flavor: SiteFlavor;
};

export type PrerenderPolicy = readonly SubstancePrerenderPriority[];

const ENGLISH_PUBLIC_TIERS: PrerenderPolicy = Object.freeze(["high", "normal"]);

const ON_DEMAND: PrerenderPolicy = Object.freeze([]);

const PUBLIC_DOSEWIKI_POLICY: Readonly<Record<LocaleCode, PrerenderPolicy>> = Object.freeze({
  en: ENGLISH_PUBLIC_TIERS,
  "zh-Hans": ON_DEMAND,
  ru: ON_DEMAND,
  nl: ON_DEMAND,
});

export function resolvePrerenderPolicy(locale: LocaleCode, build: PrerenderBuild): PrerenderPolicy {
  if (build.surface === "editor" || build.flavor === "effectindex") {
    return ON_DEMAND;
  }
  return PUBLIC_DOSEWIKI_POLICY[locale] ?? ON_DEMAND;
}
