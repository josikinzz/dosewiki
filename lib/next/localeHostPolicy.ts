/**
 * Locale mirrors of dose.wiki: one subdomain per language, served by the
 * public deployment from the `/<prefix>/...` routes the middleware rewrites
 * to. Substance articles, the record pages, the indexes and their tab views,
 * psychoactive class views, chemical class pages, psychoactive summaries, and
 * search are localized; every other path on a locale host serves the English
 * page unchanged so navigation never leaves the host.
 *
 * The hosts are deliberately unlisted: each mirror carries `noindex` and a
 * canonical link back to the English page.
 */
import { normalizeHost } from "./publicHostPolicy";
import { SUBSTANCE_INDEX_VIEW_PARAMS } from "../../src/utils/indexViewRoutes";
import {
  PUBLIC_LOCALES,
  type LocaleIdentity,
  type TranslationLocaleCode,
} from "../../src/i18n/localeRegistry.mjs";

export type LiveLocale = Pick<LocaleIdentity<TranslationLocaleCode>, "code"> & {
  pathPrefix: string;
  /** Language attribute consumed by the existing static route wrappers. */
  htmlLang: string;
};

export const LIVE_LOCALES: Readonly<Record<string, LiveLocale>> = Object.freeze(
  Object.fromEntries(PUBLIC_LOCALES.map((locale) => [
    locale.publicHost,
    { ...locale, htmlLang: locale.htmlLanguage },
  ])),
);

export const LIVE_LOCALE_CODES: readonly TranslationLocaleCode[] = Object.freeze(
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

/** The mirror route for one public substance slug. */
export function localizedArticleRoutePath(locale: LiveLocale, slug: string): string {
  return `${locale.pathPrefix}/${slug}`;
}

/**
 * The English index paths the middleware also localizes, in route order. The
 * Substance and Effect Index group views are the same pages opened on routed
 * tabs, and the replication tabs localize as one section. `/search` renders
 * its results client-side; the mirror
 * route exists so the chrome and the result labels resolve the locale.
 */
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

/** The mirror route for one English index path, when that path localizes. */
/**
 * The mirror host's 404 page. The middleware rewrites every mirror-host path
 * outside the public corpus here with a 404 status; the page renders the
 * not-found chrome in the mirror's language. Unroutable on English hosts
 * like every other `/zh` path.
 */
export function localizedNotFoundRoutePath(locale: LiveLocale): string {
  return `${locale.pathPrefix}/unroutable/missing`;
}

export function localizedIndexRoutePath(locale: LiveLocale, pathname: string): string | null {
  if (!LOCALIZED_INDEX_PATHS.includes(pathname)) {
    return null;
  }
  return pathname === "/" ? locale.pathPrefix : `${locale.pathPrefix}${pathname}`;
}

/**
 * The mirror route prefix and slug for one mirrored detail path. Substance
 * articles route through the corpus-gated slug check in the middleware; this
 * covers category, effect, report, library article, chemical class,
 * replication permalink, replication artist, and psychoactive summary paths.
 * These routes resolve their dynamic keys against their own public data and
 * return 404 when the key is absent. Artists, class definitions, and summaries
 * are not translation records, so their `kind` values describe routing rather
 * than store records.
 */
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
  // The viewer route is the middleware's own rewrite target for
  // `/replications?viewer=`; a document addressed there directly is unroutable
  // before this runs, so a single segment here is a permalink unless it names
  // one of the section's tabs, which localize as indexes.
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

/** Every cache path an English article expiry must also expire. */
export function localizedArticlePaths(slug: string): string[] {
  return Object.values(LIVE_LOCALES).map((locale) => localizedArticleRoutePath(locale, slug));
}

/** Every cache path an English effect expiry must also expire. */
export function localizedEffectPaths(effectSlug: string): string[] {
  return Object.values(LIVE_LOCALES).map((locale) => `${locale.pathPrefix}/effects/${effectSlug}`);
}

/** Every cache path an English report expiry must also expire. */
export function localizedReportPaths(slug: string): string[] {
  return Object.values(LIVE_LOCALES).map((locale) => `${locale.pathPrefix}/reports/${slug}`);
}

/** Every cache path an English library article expiry must also expire. */
export function localizedLibraryPaths(slug: string): string[] {
  return Object.values(LIVE_LOCALES).map((locale) => `${locale.pathPrefix}/articles/${slug}`);
}

/** Every cache path an English replication permalink expiry must also expire. */
export function localizedReplicationPaths(slug: string): string[] {
  return Object.values(LIVE_LOCALES).map((locale) => `${locale.pathPrefix}/replications/${slug}`);
}

/** The mirror viewer route for one deep-linked replication, per locale. */
export function localizedReplicationViewerRoutePath(locale: LiveLocale, slug: string): string {
  return `${locale.pathPrefix}/replications/viewer/${slug}`;
}

/** Every localized index cache path for one English index path. */
export function localizedIndexPaths(pathname: string): string[] {
  return Object.values(LIVE_LOCALES).map((locale) => localizedIndexRoutePath(locale, pathname)).filter(
    (path): path is string => path !== null,
  );
}
