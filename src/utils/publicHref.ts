import { slugify } from "./slug";
import { getPublicRoutePath } from "./publicRouteIdentity";

export type PublicClassificationType = "chemical" | "psychoactive";

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
    const fallback = slugOrLabel.trim();
    const slug = slugify(slugOrLabel) || fallback;
    const base = type === "chemical" ? "chemical" : "psychoactive";
    if (slug.length === 0) {
      return `/${base}`;
    }

    return getPublicRoutePath({
      family: type === "chemical" ? "chemicalClass" : "psychoactiveClass",
      params: { slug },
    });
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
};

export function getPublicHref(intent: PublicHrefIntent): string {
  switch (intent.type) {
    case "home":
      return publicHref.home();
    case "substances":
      return publicHref.substances();
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
