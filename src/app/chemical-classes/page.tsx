import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getPublicChemicalClassIndex } from "@server/convex/publicChemicalClassIndex";
import { ChemicalClassIndexExplorer } from "@/features/chemical-classes/pages/ChemicalClassIndexExplorer";

export const revalidate = 3600;

export async function generateMetadata() {
  const entries = await getPublicChemicalClassIndex();

  return buildPublicPageMetadata({
    title: `Chemical classes · ${entries.length} classes`,
    description: `Browse psychoactive substances grouped by chemical class across ${entries.length} classes on dose.wiki.`,
    route: { family: "chemicalClasses" },
  });
}

export default async function ChemicalClassesPage() {
  const entries = await getPublicChemicalClassIndex();

  return <ChemicalClassIndexExplorer entries={entries} />;
}
