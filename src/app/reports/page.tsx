import { getPublicDataOverview } from "@server/convex/publicData";
import { buildPageMetadata } from "@server/next/metadata";
import { LegacyPublicRouteClient } from "../_components/LegacyPublicRouteClient";

export const revalidate = 3600;

export async function generateMetadata() {
  const overview = await getPublicDataOverview();

  return buildPageMetadata({
    title: `Reports · ${overview.reportCount} entries`,
    description: `Browse ${overview.reportCount} trip reports in dose.wiki.`,
    pathname: "/reports",
  });
}

export default function ReportsPage() {
  return <LegacyPublicRouteClient view={{ type: "reports" }} />;
}
