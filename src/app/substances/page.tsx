import { buildPageMetadata } from "@server/next/metadata";
import { getPublicDataOverview } from "@server/convex/publicData";
import { LegacyPublicRouteClient } from "../_components/LegacyPublicRouteClient";

export const revalidate = 3600;

export async function generateMetadata() {
  const overview = await getPublicDataOverview();

  return buildPageMetadata({
    title: `Substances · ${overview.substanceCount} records`,
    description: `Browse ${overview.substanceCount} substance records in dose.wiki.`,
    pathname: "/substances",
  });
}

export default function SubstancesPage() {
  return <LegacyPublicRouteClient view={{ type: "substances" }} />;
}
