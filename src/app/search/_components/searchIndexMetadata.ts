import { buildPageMetadata } from "@server/next/metadata";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { t } from "@/i18n/server";

/** The trimmed `?q=` value of a search request, empty when absent. */
export function searchQueryFromParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}

/**
 * Metadata for `/search` and its mirror: the titles and descriptions render
 * through the request locale, and the page never indexes, so the canonical is
 * the English path on either host.
 */
export function getSearchIndexMetadata(query: string) {
  const siteName = SITE_FLAVOR_CONFIG.name;
  return buildPageMetadata({
    title: query ? t('Search Results for "{{query}}"', { query }) : t("Search"),
    description: query
      ? t("Search {{siteName}} for substances, effects, reports, and profiles matching {{query}}.", {
          siteName,
          query,
        })
      : t("Search {{siteName}} for substances, effects, reports, and profiles.", { siteName }),
    pathname: "/search",
    noIndex: true,
  });
}
