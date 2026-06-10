import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadReportsIndexRoute } from "@server/next/routeLoaders";
import { TripReportsPage } from "@/features/reports/pages/TripReportsPage";

export const revalidate = 3600;

export async function generateMetadata() {
  const result = await loadReportsIndexRoute();

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function ReportsPage() {
  const result = await loadReportsIndexRoute();

  return <TripReportsPage {...result.pageProps} />;
}
