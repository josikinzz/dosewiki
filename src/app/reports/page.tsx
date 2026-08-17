import { buildPublicPageMetadata, buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { loadReportsIndexRoute } from "@server/next/routeLoaders.reports";
import { buildItemListSchema, serializeJsonLd } from "@/utils/seo/structuredData";
import { TripReportsPage } from "@/features/reports/pages/TripReportsPage";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { getCopy } from "@server/next/copyBlocks";
import { resolveEmptyStateCopy } from "@server/next/emptyStateCopy";
import { applyPlaceholders } from "@/data/content/about";

export const revalidate = 3600;
const ITEM_LIST_LIMIT = 100;

export async function generateMetadata() {
  const [result, copy] = await Promise.all([loadReportsIndexRoute(), getCopy()]);

  const template =
    copy.text("seo-reports-index-description") ||
    "Browse {{reportCount}} trip reports in {{siteName}}.";

  return buildPublicPageMetadata({
    ...result.metadata,
    description: applyPlaceholders(template, {
      reportCount: result.pageProps.reports.length,
      siteName: SITE_FLAVOR_CONFIG.name,
    }),
    route: result.canonicalRoute,
  });
}

export default async function ReportsPage() {
  const [result, copy] = await Promise.all([loadReportsIndexRoute(), getCopy()]);
  const canonicalUrl = buildSiteUrl(getPublicRoutePath(result.canonicalRoute));
  const itemListJsonLd = serializeJsonLd(
    buildItemListSchema({
      url: canonicalUrl,
      name: `${SITE_FLAVOR_CONFIG.name} Trip Reports`,
      description: `Browse first-person ${SITE_FLAVOR_CONFIG.name} trip reports by substance, title, and author.`,
      items: result.pageProps.reports.slice(0, ITEM_LIST_LIMIT).map((report) => ({
        name: report.title,
        url: buildSiteUrl(getPublicRoutePath({ family: "report", params: { slug: report.slug } })),
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
        emptyState={resolveEmptyStateCopy(copy, "reports", result.pageProps.emptyState)}
        intro={copy.text("reports-index-intro")}
      />
    </>
  );
}
