/**
 * Locale mirrors of dose.wiki: one subdomain per language, served by the
 * public deployment from the `/<prefix>/[slug]` route the middleware rewrites
 * to. Only substance articles are localized; every other path on a locale host
 * serves the English page unchanged so navigation never leaves the host.
 *
 * The hosts are deliberately unlisted: each mirror carries `noindex` and a
 * canonical link back to the English article.
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

/** Every cache path an English article expiry must also expire. */
export function localizedArticlePaths(slug: string): string[] {
  return Object.values(LIVE_LOCALES).map((locale) => localizedArticleRoutePath(locale, slug));
}
