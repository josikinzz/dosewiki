import { getPublicMechanismDetail } from "@server/convex/publicLibrary";
import { getStaticMechanismParams } from "@server/next/staticParams";
import {
  generateTaxonomyMetadata,
  generateTaxonomyStaticParams,
  renderTaxonomyDetailPage,
  type TaxonomyDetailRouteDescriptor,
  type TaxonomyRoutePageProps,
} from "@server/next/taxonomyDetailRoute";
import { MechanismDetailPage } from "@/components/pages/MechanismDetailPage";

export const revalidate = 3600;
export const dynamicParams = false;

export async function generateStaticParams() {
  return generateTaxonomyStaticParams(mechanismRoute);
}

type MechanismParams = {
  mechanismSlug: string;
};

const mechanismRoute: TaxonomyDetailRouteDescriptor<MechanismParams, Awaited<ReturnType<typeof getPublicMechanismDetail>>> = {
  getStaticParams: async () => (await getStaticMechanismParams()) as MechanismParams[],
  getDetail: ({ mechanismSlug }) => getPublicMechanismDetail(mechanismSlug),
  getMetadata: ({ params, detail }) => ({
    title: detail?.definition.name ?? "Mechanism",
    description: detail
      ? `Browse ${detail.definition.total} substances grouped under ${detail.definition.name}.`
      : "Browse mechanism routes.",
    route: { family: "mechanism", params },
  }),
  render: ({ detail }) => (
    <MechanismDetailPage detail={detail} drugHrefPrefix="/" categoryHrefPrefix="/category/" />
  ),
};

export async function generateMetadata(props: TaxonomyRoutePageProps<MechanismParams>) {
  return generateTaxonomyMetadata(mechanismRoute, props);
}

export default async function MechanismPage(props: TaxonomyRoutePageProps<MechanismParams>) {
  return renderTaxonomyDetailPage(mechanismRoute, props);
}
