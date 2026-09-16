import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { applyPlaceholders } from "@/data/content/about";
import { TripReportsPage } from "@/features/reports/pages/TripReportsPage";
import type { LiveLocale } from "@server/next/localeHostPolicy";
import { t } from "@/i18n/server";
import { msg } from "@/i18n/messages";
import type { ReportsIndexView } from "@/utils/indexViewRoutes";
import { buildItemListSchema, serializeJsonLd } from "@/utils/seo/structuredData";
import { getCopyByKeys, getCopyKeysByPrefix } from "@server/next/copyBlocks";
import { resolveEmptyStateCopy } from "@server/next/emptyStateCopy";
import {
  buildPublicPageMetadata,
  buildSiteUrl,
  getPublicRoutePath,
} from "@server/next/publicSite";
import { loadReportsIndexRoute } from "@server/next/routeLoaders.reports";

const ITEM_LIST_LIMIT = 100;
const REPORTS_COPY_KEYS = [
  "seo-reports-index-description",
  ...getCopyKeysByPrefix("empty-reports-"),
];

export async function getReportsIndexMetadata(
  pathname: string,
  options: { noIndex?: boolean; canonicalPathname?: string; locale?: LiveLocale | null } = {},
) {
  const [result, copy] = await Promise.all([
    loadReportsIndexRoute(options.locale),
    getCopyByKeys(REPORTS_COPY_KEYS),
  ]);
  const template =
    copy.text("seo-reports-index-description") ||
    msg("Browse {{reportCount}} trip reports in {{siteName}}.");

  return buildPublicPageMetadata({
    ...result.metadata,
    description: applyPlaceholders(t(template, { reportCount: result.pageProps.browsingPage.total, siteName: SITE_FLAVOR_CONFIG.name }), {
      reportCount: result.pageProps.browsingPage.total,
      siteName: SITE_FLAVOR_CONFIG.name,
    }),
    pathname: options.canonicalPathname ?? pathname,
    noIndex: options.noIndex,
  });
}

export async function ReportsIndexRoute({
  initialView,
  pathname,
  locale = null,
}: {
  initialView: ReportsIndexView;
  pathname: string;
  locale?: LiveLocale | null;
}) {
  const [result, copy] = await Promise.all([
    loadReportsIndexRoute(locale, initialView),
    getCopyByKeys(REPORTS_COPY_KEYS),
  ]);
  const canonicalUrl = buildSiteUrl(pathname);
  const itemListJsonLd = serializeJsonLd(
    buildItemListSchema({
      url: canonicalUrl,
      name: `${SITE_FLAVOR_CONFIG.name} Trip Reports`,
      description: `Browse first-person ${SITE_FLAVOR_CONFIG.name} trip reports by substance, title, and author.`,
      items: result.pageProps.reports.slice(0, ITEM_LIST_LIMIT).map((report) => ({
        name: report.title,
        url: buildSiteUrl(
          getPublicRoutePath({ family: "report", params: { slug: report.slug } }),
        ),
      })),
    }),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListJsonLd }}
      />
      <TripReportsPage
        {...result.pageProps}
        initialView={initialView}
        locale={locale?.code}
        emptyState={resolveEmptyStateCopy(copy, "reports", result.pageProps.emptyState)}
      />
    </>
  );
}
