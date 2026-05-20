import { getPublicPsychoactiveClassDetail } from "@server/convex/publicLibrary";
import { getStaticPsychoactiveClassParams } from "@server/next/staticParams";
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
  return generateTaxonomyStaticParams(psychoactiveClassRoute);
}

type ClassificationParams = {
  slug: string;
};

const psychoactiveClassRoute: TaxonomyDetailRouteDescriptor<ClassificationParams, Awaited<ReturnType<typeof getPublicPsychoactiveClassDetail>>> = {
  getStaticParams: async () => (await getStaticPsychoactiveClassParams()) as ClassificationParams[],
  getDetail: ({ slug }) => getPublicPsychoactiveClassDetail(slug),
  getMetadata: ({ params, detail }) => ({
    title: detail?.label ?? "Psychoactive class",
    description: detail ? `Browse ${detail.total} substances in the ${detail.label} psychoactive class.` : "Browse psychoactive class routes.",
    route: { family: "psychoactiveClass", params },
  }),
  render: ({ detail }) => <ClassificationDetailPage detail={detail} drugHrefPrefix="/" />,
};

export async function generateMetadata(props: TaxonomyRoutePageProps<ClassificationParams>) {
  return generateTaxonomyMetadata(psychoactiveClassRoute, props);
}

export default async function PsychoactiveClassificationPage(props: TaxonomyRoutePageProps<ClassificationParams>) {
  return renderTaxonomyDetailPage(psychoactiveClassRoute, props);
}
