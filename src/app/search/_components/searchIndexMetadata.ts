import { buildPageMetadata } from "@server/next/metadata";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { t } from "@/i18n/server";

export function searchQueryFromParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}

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
