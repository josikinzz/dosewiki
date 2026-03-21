import { buildPageMetadata } from "@server/next/metadata";
import { getPublicCategoryLayout, getPublicDataOverview, getPublicSubstanceLookup } from "@server/convex/publicData";
import { DosagesPage } from "@/components/pages/DosagesPage";

export const revalidate = 3600;

export async function generateMetadata() {
  const overview = await getPublicDataOverview();

  return buildPageMetadata({
    title: `Substances · ${overview.substanceCount} records`,
    description: `Browse ${overview.substanceCount} substance records in dose.wiki.`,
    pathname: "/substances",
  });
}

export default async function SubstancesPage() {
  const [layout, substances] = await Promise.all([getPublicCategoryLayout(), getPublicSubstanceLookup()]);

  if (!layout) {
    throw new Error("Public category layout is unavailable.");
  }

  return <DosagesPage layout={layout} substances={substances} />;
}
