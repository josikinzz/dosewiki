import { getPublicChemicalClassDetail } from "@server/convex/publicLibrary";
import { getStaticChemicalClassParams } from "@server/next/staticParams";
import {
  generateTaxonomyMetadata,
  generateTaxonomyStaticParams,
  renderTaxonomyDetailPage,
  type TaxonomyDetailRouteDescriptor,
  type TaxonomyRoutePageProps,
} from "@server/next/taxonomyDetailRoute";
import { ClassificationDetailPage } from "@/components/pages/ClassificationDetailPage";

export const revalidate = 3600;

export async function generateStaticParams() {
  return generateTaxonomyStaticParams(chemicalClassRoute);
}

type ClassificationParams = {
  slug: string;
};

const chemicalClassRoute: TaxonomyDetailRouteDescriptor<ClassificationParams, Awaited<ReturnType<typeof getPublicChemicalClassDetail>>> = {
  getStaticParams: async () => (await getStaticChemicalClassParams()) as ClassificationParams[],
  getDetail: ({ slug }) => getPublicChemicalClassDetail(slug),
  getMetadata: ({ params, detail }) => ({
    title: detail?.label ?? "Chemical class",
    description: detail ? `Browse ${detail.total} substances in the ${detail.label} chemical class.` : "Browse chemical class routes.",
    route: { family: "chemicalClass", params },
  }),
  render: ({ detail }) => <ClassificationDetailPage detail={detail} drugHrefPrefix="/" />,
};

export async function generateMetadata(props: TaxonomyRoutePageProps<ClassificationParams>) {
  return generateTaxonomyMetadata(chemicalClassRoute, props);
}

export default async function ChemicalClassificationPage(props: TaxonomyRoutePageProps<ClassificationParams>) {
  return renderTaxonomyDetailPage(chemicalClassRoute, props);
}
