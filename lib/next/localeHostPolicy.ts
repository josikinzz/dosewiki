/**
 * Locale mirrors of dose.wiki: one subdomain per language, served by the
 * public deployment from the `/<prefix>/...` routes the middleware rewrites
 * to. Substance articles plus the two discovery surfaces (`/` and
 * `/substances`) are localized; every other path on a locale host serves the
 * English page unchanged so navigation never leaves the host.
 *
 * The hosts are deliberately unlisted: each mirror carries `noindex` and a
 * canonical link back to the English page.
 */
import { normalizeHost } from "./publicHostPolicy";

export type LiveLocale = {
  /** BCP 47 tag, also the `locale` column of `translationSegments`. */
  code: "zh-Hans";
  /** Route prefix the middleware rewrites the locale host onto. */
  pathPrefix: string;
  /** `lang` attribute on the localized article wrapper. */
  htmlLang: string;
};

export const LIVE_LOCALES: Readonly<Record<string, LiveLocale>> = {
  "zh.dose.wiki": { code: "zh-Hans", pathPrefix: "/zh", htmlLang: "zh-Hans" },
};

export const LIVE_LOCALE_CODES = Object.values(LIVE_LOCALES).map((locale) => locale.code);

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

/** The English index paths the middleware also localizes, in route order. */
export const LOCALIZED_INDEX_PATHS = ["/", "/substances", "/effects", "/reports", "/about"] as const;

/** The mirror route for one English index path, when that path localizes. */
export function localizedIndexRoutePath(locale: LiveLocale, pathname: string): string | null {
  if (!LOCALIZED_INDEX_PATHS.includes(pathname as (typeof LOCALIZED_INDEX_PATHS)[number])) {
    return null;
  }
  return pathname === "/" ? locale.pathPrefix : `${locale.pathPrefix}${pathname}`;
}

/**
 * The mirror route prefix and slug for one mirrored record path. Substance
 * articles route through the corpus-gated slug check in the middleware; this
 * covers the effect and report detail paths, which the zh routes resolve
 * against the live record and 404 on their own.
 */
export function localizedRecordRoutePath(
  locale: LiveLocale,
  pathname: string,
): { path: string; kind: "effect" | "report"; slug: string } | null {
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

/** Every localized index cache path for one English index path. */
export function localizedIndexPaths(pathname: string): string[] {
  return Object.values(LIVE_LOCALES).map((locale) => localizedIndexRoutePath(locale, pathname)).filter(
    (path): path is string => path !== null,
  );
}
