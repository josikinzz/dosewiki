import { getPublicMechanismDetail } from "@server/convex/publicLibrary";
import { getStaticMechanismQualifierParams } from "@server/next/staticParams";
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
  return generateTaxonomyStaticParams(mechanismQualifierRoute);
}

type MechanismQualifierParams = {
  mechanismSlug: string;
  qualifierSlug: string;
};

type MechanismQualifierDetail = {
  detail: Awaited<ReturnType<typeof getPublicMechanismDetail>>;
  qualifier: NonNullable<Awaited<ReturnType<typeof getPublicMechanismDetail>>>["qualifiers"][number] | undefined;
};

async function getMechanismQualifierDetail({
  mechanismSlug,
  qualifierSlug,
}: MechanismQualifierParams): Promise<MechanismQualifierDetail> {
  const detail = await getPublicMechanismDetail(mechanismSlug);
  const qualifier = detail?.qualifiers.find((entry) => entry.key === qualifierSlug);

  return { detail, qualifier };
}

const mechanismQualifierRoute: TaxonomyDetailRouteDescriptor<MechanismQualifierParams, MechanismQualifierDetail> = {
  getStaticParams: async () => (await getStaticMechanismQualifierParams()) as MechanismQualifierParams[],
  getDetail: getMechanismQualifierDetail,
  isMissing: ({ detail, qualifier }) => !detail || !qualifier,
  getMetadata: ({ params, detail: { detail, qualifier } }) => ({
    title: qualifier ? `${detail?.definition.name} · ${qualifier.label}` : "Mechanism qualifier",
    description: qualifier ? `Browse ${qualifier.total} substances in the ${qualifier.label} qualifier.` : "Browse mechanism qualifier routes.",
    route: { family: "mechanismQualifier", params },
  }),
  render: ({ params, detail }) => (
    <MechanismDetailPage
      detail={detail.detail!}
      activeQualifierSlug={params.qualifierSlug}
      drugHrefPrefix="/"
      categoryHrefPrefix="/category/"
    />
  ),
};

export async function generateMetadata(props: TaxonomyRoutePageProps<MechanismQualifierParams>) {
  return generateTaxonomyMetadata(mechanismQualifierRoute, props);
}

export default async function MechanismQualifierPage(props: TaxonomyRoutePageProps<MechanismQualifierParams>) {
  return renderTaxonomyDetailPage(mechanismQualifierRoute, props);
}
