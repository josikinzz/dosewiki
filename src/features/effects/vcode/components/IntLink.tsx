import { SmartLink } from "@/components/common/SmartLink";
import { PropsWithChildren } from "react";

import { effectIndexLegacyRedirects } from "@server/next/effectIndexLegacyRedirects";
import { publicHref } from "@/utils/publicHref";

interface IntLinkProps {
  to?: string;
}

const PSYCHOACTIVE_ROUTE_ALIASES = {
  antidepressants: "antidepressant",
  antidepressant: "antidepressant",
  antipsychotics: "antipsychotic",
  antipsychotic: "antipsychotic",
  cannabinoids: "cannabinoid",
  cannabinoid: "cannabinoid",
  deliriants: "deliriant",
  deliriant: "deliriant",
  depressants: "depressant",
  depressant: "depressant",
  dissociatives: "dissociative",
  dissociative: "dissociative",
  entactogens: "entactogen",
  entactogen: "entactogen",
  gabaergics: "gabaergic",
  gabaergic: "gabaergic",
  hallucinogens: "hallucinogen",
  hallucinogen: "hallucinogen",
  nootropics: "nootropic",
  nootropic: "nootropic",
  opioids: "opioid",
  opioid: "opioid",
  psychedelics: "psychedelic",
  psychedelic: "psychedelic",
  stimulants: "stimulant",
  stimulant: "stimulant",
} as const satisfies Record<string, string>;

const EFFECT_CATEGORY_ROUTE_ALIASES = {
  auditory: "auditory-effects",
  cognitive: "cognitive-effects",
  "geometric-pattern": "geometric-patterns",
  hallucinatory: "hallucinatory-states",
  "hallucinatory-state": "hallucinatory-states",
  multisensory: "multisensory-effects",
  physical: "physical-effects",
  "smell-and-taste": "smell-and-taste-effects",
  tactile: "tactile-effects",
  visual: "visual-effects",
  visuals: "visual-effects",
} as const satisfies Record<string, string>;

const CURATED_PSYCHOACTIVE_SUMMARY_PATHS = new Set([
  "/psychoactive/psychedelic/visual",
  "/psychoactive/psychedelic/cognitive",
  "/psychoactive/psychedelic/miscellaneous",
  "/psychoactive/dissociative",
  "/psychoactive/deliriant",
]);

function splitPathSuffix(path: string) {
  const suffixIndex = path.search(/[?#]/);

  if (suffixIndex === -1) {
    return { pathname: path, suffix: "" };
  }

  return {
    pathname: path.slice(0, suffixIndex),
    suffix: path.slice(suffixIndex),
  };
}

function normalizeSubarticleSuffix(suffix: string) {
  const match = /^\?s=([^&#]+)$/.exec(suffix);

  return match ? `#${match[1].trim().toLowerCase()}` : suffix;
}

const SUBARTICLE_SELECTOR_CORRECTIONS: Record<string, string> = {
  "/effects/memory-suppression?s=ego-death": "/effects/ego-death",
  "/effects/memory-suppression?s=physical-auntomy": "/effects/physical-autonomy",
};

const DIRECT_PATH_CORRECTIONS: Readonly<Record<string, string>> = {
  "/dxm": "/dextromethorphan",
  "/effects/acuity-enhancement": "/effects/visual-acuity-enhancement",
  "/effects/category/effects": "/effects",
  "/effects/category/visual-enhancements": "/effects/category/visual-amplifications",
  "/effects/diffraction-spikes": "/effects/diffraction",
  "/effects/memory-suppressionShort": "/effects/memory-suppression",
  "/effects/stimulating": "/effects/stimulation",
  "/effects/suggestibility-enhancement": "/effects/increased-suggestibility",
  "/effects/sweating": "/effects/increased-perspiration",
  "/profiles/Josie": "/contributors/josie",
};

const NON_LINKABLE_INTERNAL_PATHS: ReadonlySet<string> = new Set([
  "/effects/pattern-recognition-enhancement",
  "/effects/pattern-recognition-suppression",
  "/effects/psychedelic-therapy",
]);

const PRE_NORMALIZATION_REDIRECTS = new Map<string, string>(
  effectIndexLegacyRedirects
    .filter((redirect) => redirect.source.startsWith("/substances/"))
    .map((redirect) => [redirect.source, redirect.destination]),
);

function trimTrailingSlash(pathname: string) {
  if (pathname === "/") {
    return pathname;
  }

  return pathname.replace(/\/+$/, "");
}

function isExternalHref(path: string) {
  return path.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(path);
}

function normalizeRouteAlias<T extends Record<string, string>>(
  segment: string | undefined,
  aliases: T,
) {
  if (!segment) {
    return null;
  }

  return aliases[segment.trim().toLowerCase() as keyof T] ?? null;
}

function normalizeEffectPath(pathname: string) {
  let path = pathname;

  if (/^\/effects(?=[A-Za-z0-9])/.test(path)) {
    path = path.replace(/^\/effects/, "/effects/");
  }

  path = path.replace(/^\/effects(?:\/effects)+\//, "/effects/");

  if (path.startsWith("/effects/category/")) {
    const segments = path.split("/").filter(Boolean);
    const categorySlug = segments[2];
    const alias = normalizeRouteAlias(categorySlug, EFFECT_CATEGORY_ROUTE_ALIASES);

    if (alias) {
      return `/effects/category/${alias}`;
    }
  }

  return path;
}

function normalizeLegacyCategoryPath(pathname: string) {
  if (pathname !== "/categories" && !pathname.startsWith("/categories/")) {
    return pathname;
  }

  const segments = pathname.split("/").filter(Boolean);
  const categorySlug = segments[1];

  if (!categorySlug) {
    return "/effects";
  }

  const alias = normalizeRouteAlias(categorySlug, EFFECT_CATEGORY_ROUTE_ALIASES);

  return `/effects/category/${alias ?? categorySlug}`;
}

function normalizeCategoryPath(pathname: string) {
  if (!pathname.startsWith("/category/")) {
    return pathname;
  }

  const segments = pathname.split("/").filter(Boolean);
  const categoryKey = segments[1];
  const alias = normalizeRouteAlias(categoryKey, PSYCHOACTIVE_ROUTE_ALIASES);

  if (!alias) {
    return pathname;
  }

  return `/category/${alias}`;
}

function normalizeLegacySummaryPath(pathname: string) {
  const summaryPrefixes = [
    ["/summaries/psychedelics", "/psychoactive/psychedelic"],
    ["/summaries/dissociatives", "/psychoactive/dissociative"],
    ["/summaries/deliriants", "/psychoactive/deliriant"],
    ["/summaries/", "/psychoactive/"],
  ] as const;

  for (const [prefix, replacement] of summaryPrefixes) {
    if (pathname.startsWith(prefix)) {
      return pathname.replace(prefix, replacement);
    }
  }

  return pathname;
}

function normalizePsychoactivePath(pathname: string) {
  if (!pathname.startsWith("/psychoactive/")) {
    return pathname;
  }

  const normalizedPathname = trimTrailingSlash(pathname);
  if (CURATED_PSYCHOACTIVE_SUMMARY_PATHS.has(normalizedPathname)) {
    return normalizedPathname;
  }

  const classSlug = pathname.split("/").filter(Boolean)[1];
  return classSlug ? publicHref.classification("psychoactive", classSlug) : "/substances";
}

function normalizeChemicalPath(pathname: string) {
  if (!pathname.startsWith("/chemical/")) {
    return pathname;
  }

  const classSlug = pathname.split("/").filter(Boolean)[1];
  return classSlug ? publicHref.classification("chemical", classSlug) : "/chemical-classes";
}

export function normalizeInternalPath(to?: string) {
  const rawPath = to?.trim();

  if (!rawPath) {
    return "#";
  }

  if (/^\/https?:\/\//i.test(rawPath)) {
    return rawPath.slice(1);
  }

  if (rawPath.startsWith("#") || isExternalHref(rawPath)) {
    return rawPath;
  }

  let path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const { pathname, suffix } = splitPathSuffix(path);

  path = pathname;

  const preRedirect = PRE_NORMALIZATION_REDIRECTS.get(trimTrailingSlash(path));
  if (preRedirect) {
    return `${preRedirect}${normalizeSubarticleSuffix(suffix)}`;
  }

  if (path.startsWith("/substances/")) {
    const substanceSlug = path.slice("/substances/".length);

    path = substanceSlug ? `/${substanceSlug}` : "/substances";
  }

  path = normalizeLegacySummaryPath(path);
  path = normalizeEffectPath(path);
  path = normalizeLegacyCategoryPath(path);
  path = normalizeCategoryPath(path);
  path = normalizePsychoactivePath(path);
  path = normalizeChemicalPath(path);

  const normalizedPath = trimTrailingSlash(path);

  const corrected = SUBARTICLE_SELECTOR_CORRECTIONS[`${normalizedPath}${suffix}`];
  if (corrected) {
    return corrected;
  }

  const directCorrection = DIRECT_PATH_CORRECTIONS[normalizedPath];
  if (directCorrection) {
    return `${directCorrection}${normalizeSubarticleSuffix(suffix)}`;
  }

  return `${normalizedPath}${normalizeSubarticleSuffix(suffix)}`;
}

export function resolveInternalHref(to?: string): string | undefined {
  const href = normalizeInternalPath(to);
  return NON_LINKABLE_INTERNAL_PATHS.has(splitPathSuffix(href).pathname) ? undefined : href;
}

export function IntLink({ 
  to, 
  children,
}: PropsWithChildren<IntLinkProps>) {
  const href = resolveInternalHref(to);
  if (!href) {
    return <span>{children}</span>;
  }

  return (
    <SmartLink
      href={href}
      className="theme-accent-emphasis theme-accent-underline cursor-pointer underline underline-offset-[0.18em] transition-colors hover:text-dose-accent-soft"
    >
      {children}
    </SmartLink>
  );
}
