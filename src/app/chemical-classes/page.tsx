import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getPublicChemicalClassTreePayload } from "@server/convex/publicChemicalClassIndex";
import { ChemicalClassTreePage } from "@/features/chemical-classes/pages/ChemicalClassTreePage";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

export const revalidate = 3600;

export async function generateMetadata() {
  const payload = await getPublicChemicalClassTreePayload();
  const classCount = Object.keys(payload.nodes).length;

  return buildPublicPageMetadata({
    title: "Chemical Classes",
    description: `Browse the chemical class tree - ${classCount} classes organized by structural lineage on ${SITE_FLAVOR_CONFIG.name}.`,
    route: { family: "chemicalClasses" },
  });
}

export default async function ChemicalClassesPage() {
  const payload = await getPublicChemicalClassTreePayload();

  return <ChemicalClassTreePage payload={payload} />;
}
