import { getPublicDataOverview } from "@server/convex/publicData";
import { buildPageMetadata } from "@server/next/metadata";
import { LegacyPublicRouteClient } from "../_components/LegacyPublicRouteClient";

export const revalidate = 3600;

export async function generateMetadata() {
  const overview = await getPublicDataOverview();

  return buildPageMetadata({
    title: `Effects · ${overview.effectCount} records`,
    description: `Browse ${overview.effectCount} subjective effect entries in dose.wiki.`,
    pathname: "/effects",
  });
}

export default function EffectsPage() {
  return <LegacyPublicRouteClient view={{ type: "effects" }} />;
}
