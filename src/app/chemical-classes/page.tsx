import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadChemicalClassTreeRoute } from "@server/next/routeLoaders.chemicalClasses";
import { ChemicalClassTreePage } from "@/features/chemical-classes/pages/ChemicalClassTreePage";
import { t } from "@/i18n/server";
import { pageSocialCardImage } from "@/data/mappings/pageSocialCardUrl";

export const revalidate = 3600;

export async function generateMetadata() {
  const result = await loadChemicalClassTreeRoute();

  return buildPublicPageMetadata({
    title: result.metadata.title,
    description: t(result.metadata.description, result.metadata.values),
    route: result.canonicalRoute,
    socialImage: pageSocialCardImage("chemical-classes", "dose.wiki Chemical Class Index"),
  });
}

export default async function ChemicalClassesPage() {
  const result = await loadChemicalClassTreeRoute();

  return <ChemicalClassTreePage payload={result.payload} />;
}
