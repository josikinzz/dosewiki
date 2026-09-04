import { slugify } from "./slug";
import { getPublicRoutePath } from "./publicRouteIdentity";
import { resolveChemicalClassKey } from "@/data/indexes/chemicalClassLookup";
import {
  parseLegacySubstanceIndexHash,
  substanceIndexViewPath,
} from "./indexViewRoutes";

export type PublicClassificationType = "chemical" | "psychoactive";

/**
 * Psychoactive-class labels that don't have their own Substance Index tab map to
 * the umbrella super-tab (or a canonical sibling) so a badge still opens a real
 * tab. Labels not listed fall through to their own slug, which is the tab id for
 * the per-class tabs (psychedelic, stimulant, entactogen, gabaergic, opioid, …).
 */
const PSYCHOACTIVE_TAB_ALIASES: Record<string, string> = {
  depressant: "super:depressants",
  sedative: "super:depressants",
  anxiolytic: "super:depressants",
  hypnotic: "super:depressants",
  "muscle-relaxant": "super:depressants",
  anticonvulsant: "super:depressants",
  hallucinogen: "super:hallucinogens",
  "atypical-hallucinogen": "super:hallucinogens",
  "a-typical-hallucinogen": "super:hallucinogens",
  eugeroic: "stimulant",
  entheogen: "psychedelic",
  empathogen: "entactogen",
};

export interface PublicReportHrefOptions {
  fromSubstanceSlug?: string;
}

export interface PublicContributorHrefOptions {
  normalizeKey?: boolean;
}

const encodePathSegment = (value: string) => encodeURIComponent(value.trim());

const nonEmptyPathSegment = (value: string) => {
  const segment = value.trim();
  return segment.length > 0 ? segment : null;
};

export const publicHref = {
  home: () => "/",
  substances: () => "/substances",
  mantras: () => getPublicRoutePath({ family: "mantras" }),
  replications: () => getPublicRoutePath({ family: "replications" }),
  replication: (slug: string) => {
    const segment = nonEmptyPathSegment(slug);
    return segment
      ? getPublicRoutePath({ family: "replication", params: { slug: segment } })
      : getPublicRoutePath({ family: "replications" });
  },
  substance: (slug: string) => {
    const segment = nonEmptyPathSegment(slug);
    return segment ? getPublicRoutePath({ family: "substance", params: { slug: segment } }) : "/substances";
  },
  effects: () => "/effects",
  effect: (slug: string) => {
    const segment = nonEmptyPathSegment(slug);
    return segment ? getPublicRoutePath({ family: "effect", params: { effectSlug: segment } }) : "/effects";
  },
  effectFromName: (name: string) => publicHref.effect(slugify(name)),
  effectCategory: (categorySlug: string) => {
    const segment = nonEmptyPathSegment(categorySlug);
    return segment ? getPublicRoutePath({ family: "effectCategory", params: { categorySlug: segment } }) : "/effects";
  },
  dosageCategory: (categoryKey: string) => {
    const segment = nonEmptyPathSegment(categoryKey);
    return segment ? getPublicRoutePath({ family: "category", params: { categoryKey: segment } }) : "/substances";
  },
  category: (categoryKey: string) => publicHref.dosageCategory(categoryKey),
  mechanism: (mechanismSlug: string, qualifierSlug?: string) => {
    const mechanism = nonEmptyPathSegment(mechanismSlug);
    if (!mechanism) {
      return "/substances";
    }

    const qualifier = qualifierSlug ? nonEmptyPathSegment(qualifierSlug) : null;
    return qualifier
      ? getPublicRoutePath({
          family: "mechanismQualifier",
          params: { mechanismSlug: mechanism, qualifierSlug: qualifier },
        })
      : getPublicRoutePath({ family: "mechanism", params: { mechanismSlug: mechanism } });
  },
  mechanismFromLabel: (label: string, qualifierLabel?: string) =>
    publicHref.mechanism(slugify(label), qualifierLabel ? slugify(qualifierLabel) : undefined),
  classification: (type: PublicClassificationType, slugOrLabel: string) => {
    if (type === "chemical") {
      const key = resolveChemicalClassKey(slugOrLabel);
      return key ? getPublicRoutePath({ family: "chemicalClass", params: { classKey: key } }) : "/chemical-classes";
    }

    const base = slugOrLabel.replace(/\s*\([^)]*\)\s*$/, "");
    const slug = slugify(base);
    const view = parseLegacySubstanceIndexHash(
      PSYCHOACTIVE_TAB_ALIASES[slug] ?? slug,
    );
    return view ? substanceIndexViewPath(view) : "/substances";
  },
  reports: () => "/reports",
  reportSubmission: () => "/reports/submit",
  report: (slug: string, options: PublicReportHrefOptions = {}) => {
    const segment = nonEmptyPathSegment(slug);
    if (!segment) {
      return "/reports";
    }

    const from = options.fromSubstanceSlug?.trim();
    const reportPath = getPublicRoutePath({ family: "report", params: { slug: segment } });
    return from ? `${reportPath}?from=${encodeURIComponent(from)}` : reportPath;
  },
  contributor: (profileKey: string, options: PublicContributorHrefOptions = {}) => {
    const key = nonEmptyPathSegment(profileKey);
    if (!key) {
      return "/contributors";
    }

    const normalizedKey = options.normalizeKey === false ? key : key.toLowerCase();
    return options.normalizeKey === false
      ? `/contributors/${encodePathSegment(normalizedKey)}`
      : getPublicRoutePath({ family: "contributor", params: { profileKey: normalizedKey } });
  },
  search: (query?: string) => {
    const trimmed = query?.trim() ?? "";
    return trimmed.length > 0 ? `/search?q=${encodeURIComponent(trimmed)}` : "/search";
  },
  changes: (articleSlug?: string) => {
    const segment = articleSlug ? nonEmptyPathSegment(articleSlug) : null;
    return segment ? `/changes?article=${encodeURIComponent(segment)}` : "/changes";
  },
};

export function getPublicHref(intent: PublicHrefIntent): string {
  switch (intent.type) {
    case "home":
      return publicHref.home();
    case "substances":
      return publicHref.substances();
    case "mantras":
      return publicHref.mantras();
    case "replication":
      return publicHref.replication(intent.slug);
    case "substance":
      return publicHref.substance(intent.slug);
    case "effects":
      return publicHref.effects();
    case "effect":
      return publicHref.effect(intent.slug);
    case "effect-from-name":
      return publicHref.effectFromName(intent.name);
    case "effect-category":
      return publicHref.effectCategory(intent.categorySlug);
    case "category":
    case "dosage-category":
      return publicHref.dosageCategory(intent.categoryKey);
    case "mechanism":
      return publicHref.mechanism(intent.mechanismSlug, intent.qualifierSlug);
    case "mechanism-from-label":
      return publicHref.mechanismFromLabel(intent.label, intent.qualifierLabel);
    case "classification":
      return publicHref.classification(intent.classification, intent.slugOrLabel);
    case "reports":
      return publicHref.reports();
    case "report-submission":
      return publicHref.reportSubmission();
    case "report":
      return publicHref.report(intent.slug, { fromSubstanceSlug: intent.fromSubstanceSlug });
    case "contributor":
      return publicHref.contributor(intent.profileKey, { normalizeKey: intent.normalizeKey });
    case "search":
      return publicHref.search(intent.query);
  }
}

export type PublicHrefIntent =
  | { type: "home" }
  | { type: "substances" }
  | { type: "mantras" }
  | { type: "replication"; slug: string }
  | { type: "substance"; slug: string }
  | { type: "effects" }
  | { type: "effect"; slug: string }
  | { type: "effect-from-name"; name: string }
  | { type: "effect-category"; categorySlug: string }
  | { type: "category"; categoryKey: string }
  | { type: "dosage-category"; categoryKey: string }
  | { type: "mechanism"; mechanismSlug: string; qualifierSlug?: string }
  | { type: "mechanism-from-label"; label: string; qualifierLabel?: string }
  | { type: "classification"; classification: PublicClassificationType; slugOrLabel: string }
  | { type: "reports" }
  | { type: "report-submission" }
  | { type: "report"; slug: string; fromSubstanceSlug?: string }
  | { type: "contributor"; profileKey: string; normalizeKey?: boolean }
  | { type: "search"; query?: string };
