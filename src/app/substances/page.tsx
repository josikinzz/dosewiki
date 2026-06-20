import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getPublicDataOverview } from "@server/convex/publicData";
import { getSubstancesLayoutRouteOutcome } from "@server/next/publicRouteOutcomes";
import { getCategoryDefinitions } from "@server/next/categoryDefinitions";
import { DosagesPage } from "@/components/pages/DosagesPage";

export const revalidate = 3600;

export async function generateMetadata() {
  const overview = await getPublicDataOverview();

  return buildPublicPageMetadata({
    title: `Substances · ${overview.substanceCount} records`,
    description: `Browse ${overview.substanceCount} substance records in dose.wiki.`,
    route: { family: "substances" },
  });
}

export default async function SubstancesPage() {
  const outcome = await getSubstancesLayoutRouteOutcome();

  if (outcome.state === "unavailable") {
    throw new Error("Public category layout is unavailable.");
  }

  return (
    <DosagesPage
      layout={outcome.layout}
      substances={outcome.substances}
      definitions={getCategoryDefinitions()}
    />
  );
}
