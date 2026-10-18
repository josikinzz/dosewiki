import { normalizeHost } from "./publicHostPolicy";
import { SUBSTANCE_INDEX_VIEW_PARAMS } from "../../src/utils/indexViewRoutes";
import {
  PUBLIC_LOCALES,
  type LocaleIdentity,
  type PublicLocaleCode,
} from "../../src/i18n/localeRegistry.mjs";

export type LiveLocale = Pick<LocaleIdentity<PublicLocaleCode>, "code"> & {
  pathPrefix: string;
  htmlLang: string;
};

export const LIVE_LOCALES: Readonly<Record<string, LiveLocale>> = Object.freeze(
  Object.fromEntries(PUBLIC_LOCALES.map((locale) => [
    locale.publicHost,
    { ...locale, htmlLang: locale.htmlLanguage },
  ])),
);

export const LIVE_LOCALE_CODES: readonly PublicLocaleCode[] = Object.freeze(
  Object.values(LIVE_LOCALES).map((locale) => locale.code),
);

export function localeForHost(host: string | null | undefined): LiveLocale | null {
  return LIVE_LOCALES[normalizeHost(host)] ?? null;
}

export function localeForPathPrefix(pathname: string): LiveLocale | null {
  for (const locale of Object.values(LIVE_LOCALES)) {
    if (pathname === locale.pathPrefix || pathname.startsWith(`${locale.pathPrefix}/`)) return locale;
  }
  return null;
}

export function localizedArticleRoutePath(locale: LiveLocale, slug: string): string {
  return `${locale.pathPrefix}/${slug}`;
}

export const LOCALIZED_ROUTE_FAMILIES = Object.freeze({
  indexes: [
    "/",
    "/substances",
    ...SUBSTANCE_INDEX_VIEW_PARAMS.map(
      ({ slug }) => `/substances/group/${slug}`,
    ),
    "/effects",
    "/effects/group/sensory",
    "/effects/group/cognitive",
    "/effects/group/physical",
    "/effects/group/library",
    "/effects/group/info",
    "/reports",
    "/articles",
    "/chemical-classes",
    "/replications",
    "/replications/audio",
    "/replications/more-info",
    "/replications/tutorials",
    "/about",
    "/docs/how",
    "/docs/code",
    "/docs/license",
    "/glossary",
    "/search",
    "/changes",
  ],
  details: [
    "category",
    "effect-category",
    "effect",
    "report",
    "library",
    "chemical-class",
    "contributor",
    "replication-artist",
    "psychoactive-summary",
    "replication",
  ],
} as const);

const LOCALIZED_INDEX_PATHS: readonly string[] = LOCALIZED_ROUTE_FAMILIES.indexes;

export function localizedNotFoundRoutePath(locale: LiveLocale): string {
  return `${locale.pathPrefix}/unroutable/missing`;
}

export function localizedIndexRoutePath(locale: LiveLocale, pathname: string): string | null {
  if (!LOCALIZED_INDEX_PATHS.includes(pathname)) {
    return null;
  }
  return pathname === "/" ? locale.pathPrefix : `${locale.pathPrefix}${pathname}`;
}

type LocalizedDetailRouteKind =
  | "category"
  | "effect"
  | "effect-category"
  | "report"
  | "library"
  | "chemical-class"
  | "contributor"
  | "replication"
  | "replication-artist"
  | "psychoactive-summary";

export function localizedRecordRoutePath(
  locale: LiveLocale,
  pathname: string,
): { path: string; kind: LocalizedDetailRouteKind; slug: string } | null {
  const categoryKey = pathname.match(/^\/category\/([^/]+)\/?$/);
  if (categoryKey) {
    return {
      path: `${locale.pathPrefix}/category/${categoryKey[1]}`,
      kind: "category",
      slug: categoryKey[1],
    };
  }
  const effectCategorySlug = pathname.match(/^\/effects\/category\/([^/]+)\/?$/);
  if (effectCategorySlug) {
    return {
      path: `${locale.pathPrefix}/effects/category/${effectCategorySlug[1]}`,
      kind: "effect-category",
      slug: effectCategorySlug[1],
    };
  }
  const effectSlug = pathname.match(/^\/effects\/([^/]+)\/?$/);
  if (effectSlug) {
    return {
      path: `${locale.pathPrefix}/effects/${effectSlug[1]}`,
      kind: "effect",
      slug: effectSlug[1],
    };
  }
  const reportSlug = pathname.match(/^\/reports\/([^/]+)\/?$/);
  if (reportSlug) {
    return {
      path: `${locale.pathPrefix}/reports/${reportSlug[1]}`,
      kind: "report",
      slug: reportSlug[1],
    };
  }
  const librarySlug = pathname.match(/^\/articles\/([^/]+)\/?$/);
  if (librarySlug) {
    return {
      path: `${locale.pathPrefix}/articles/${librarySlug[1]}`,
      kind: "library",
      slug: librarySlug[1],
    };
  }
  const chemicalClassKey = pathname.match(/^\/chemical-classes\/([^/]+)\/?$/);
  if (chemicalClassKey) {
    return {
      path: `${locale.pathPrefix}/chemical-classes/${chemicalClassKey[1]}`,
      kind: "chemical-class",
      slug: chemicalClassKey[1],
    };
  }
  const contributorKey = pathname.match(/^\/contributors\/([^/]+)\/?$/);
  if (contributorKey) {
    return {
      path: `${locale.pathPrefix}/contributors/${contributorKey[1]}`,
      kind: "contributor",
      slug: contributorKey[1],
    };
  }
  const artistKey = pathname.match(/^\/replications\/artist\/([^/]+)\/?$/);
  if (artistKey) {
    return {
      path: `${locale.pathPrefix}/replications/artist/${artistKey[1]}`,
      kind: "replication-artist",
      slug: artistKey[1],
    };
  }
  const summaryPath = pathname.match(/^\/psychoactive\/([^/]+(?:\/[^/]+)*)\/?$/);
  if (summaryPath) {
    return {
      path: `${locale.pathPrefix}/psychoactive/${summaryPath[1]}`,
      kind: "psychoactive-summary",
      slug: summaryPath[1],
    };
  }
  const replicationSlug = pathname.match(/^\/replications\/([^/]+)\/?$/);
  if (replicationSlug && localizedIndexRoutePath(locale, pathname) === null) {
    return {
      path: `${locale.pathPrefix}/replications/${replicationSlug[1]}`,
      kind: "replication",
      slug: replicationSlug[1],
    };
  }
  return null;
}

export function localizedArticlePaths(slug: string): string[] {
  return Object.values(LIVE_LOCALES).map((locale) => localizedArticleRoutePath(locale, slug));
}

export function localizedEffectPaths(effectSlug: string): string[] {
  return Object.values(LIVE_LOCALES).map((locale) => `${locale.pathPrefix}/effects/${effectSlug}`);
}

export function localizedReportPaths(slug: string): string[] {
  return Object.values(LIVE_LOCALES).map((locale) => `${locale.pathPrefix}/reports/${slug}`);
}

export function localizedLibraryPaths(slug: string): string[] {
  return Object.values(LIVE_LOCALES).map((locale) => `${locale.pathPrefix}/articles/${slug}`);
}

export function localizedReplicationPaths(slug: string): string[] {
  return Object.values(LIVE_LOCALES).map((locale) => `${locale.pathPrefix}/replications/${slug}`);
}

export function localizedReplicationViewerRoutePath(locale: LiveLocale, slug: string): string {
  return `${locale.pathPrefix}/replications/viewer/${slug}`;
}

export function localizedIndexPaths(pathname: string): string[] {
  return Object.values(LIVE_LOCALES).map((locale) => localizedIndexRoutePath(locale, pathname)).filter(
    (path): path is string => path !== null,
  );
}
