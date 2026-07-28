import Link from "next/link";
import { PropsWithChildren } from "react";

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

// Legacy `/psychoactive/<slug>` links now open the matching Substance Index tab.
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

// Legacy `/chemical/<slug>` links now open the matching Chemical Class Index tab.
function normalizeChemicalPath(pathname: string) {
  if (!pathname.startsWith("/chemical/")) {
    return pathname;
  }

  const classSlug = pathname.split("/").filter(Boolean)[1];
  return classSlug ? publicHref.classification("chemical", classSlug) : "/chemical-classes";
}

function normalizeInternalPath(to?: string) {
  const rawPath = to?.trim();

  if (!rawPath) {
    return "#";
  }

  if (rawPath.startsWith("#") || isExternalHref(rawPath)) {
    return rawPath;
  }

  let path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const { pathname, suffix } = splitPathSuffix(path);

  path = pathname;

  if (path.startsWith("/substances/")) {
    path = path.replace("/substances/", "/");
  }

  path = normalizeLegacySummaryPath(path);
  path = normalizeEffectPath(path);
  path = normalizeLegacyCategoryPath(path);
  path = normalizeCategoryPath(path);
  path = normalizePsychoactivePath(path);
  path = normalizeChemicalPath(path);

  return `${trimTrailingSlash(path)}${suffix}`;
}

/**
 * Internal link to other DoseWiki pages.
 * 
 * Handles navigation to effects, substances, and other internal routes.
 * Also handles anchor links for same-page navigation.
 */
export function IntLink({ 
  to, 
  children,
}: PropsWithChildren<IntLinkProps>) {
  const href = normalizeInternalPath(to);

  return (
    <Link
      href={href}
      className="theme-accent-emphasis cursor-pointer underline decoration-fuchsia-300/35 underline-offset-[0.18em] transition-colors hover:text-dose-accent-soft hover:decoration-fuchsia-200/55"
    >
      {children}
    </Link>
  );
}
