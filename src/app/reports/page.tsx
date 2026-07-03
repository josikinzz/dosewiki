import { buildPublicPageMetadata, buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { loadReportsIndexRoute } from "@server/next/routeLoaders";
import { buildItemListSchema, serializeJsonLd } from "@/utils/seo/structuredData";
import { TripReportsPage } from "@/features/reports/pages/TripReportsPage";

export const revalidate = 3600;
const ITEM_LIST_LIMIT = 100;

export async function generateMetadata() {
  const result = await loadReportsIndexRoute();

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function ReportsPage() {
  const result = await loadReportsIndexRoute();
  const canonicalUrl = buildSiteUrl(getPublicRoutePath(result.canonicalRoute));
  const itemListJsonLd = serializeJsonLd(
    buildItemListSchema({
      url: canonicalUrl,
      name: "dose.wiki Trip Reports",
      description: "Browse first-person dose.wiki trip reports by substance, title, and author.",
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
      <TripReportsPage {...result.pageProps} />
    </>
  );
}
