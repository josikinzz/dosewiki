import { buildPublicPageMetadata } from "@server/next/publicSite";
import { flavoredCopyText, getCopy } from "@server/next/copyBlocks";
import { getPublicChemicalClassTreePayload } from "@server/convex/publicChemicalClassIndex";
import { ChemicalClassTreePage } from "@/features/chemical-classes/pages/ChemicalClassTreePage";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { pageSocialCardImage } from "@/data/mappings/pageSocialCardUrl";

export const revalidate = 3600;

export async function generateMetadata() {
  const payload = await getPublicChemicalClassTreePayload();
  const classCount = Object.keys(payload.nodes).length;
  const copy = await getCopy();

  return buildPublicPageMetadata({
    title: "Chemical Classes",
    description: flavoredCopyText(
      copy,
      "seo-chemical-classes-description",
      `Browse the chemical class tree - ${classCount} classes organized by structural lineage on ${SITE_FLAVOR_CONFIG.name}.`,
    ),
    route: { family: "chemicalClasses" },
    socialImage: pageSocialCardImage("chemical-classes", "dose.wiki Chemical Class Index"),
  });
}

export default async function ChemicalClassesPage() {
  const payload = await getPublicChemicalClassTreePayload();

  return <ChemicalClassTreePage payload={payload} />;
}
