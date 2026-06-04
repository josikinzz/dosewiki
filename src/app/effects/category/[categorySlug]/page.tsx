import {
  getEffectCategoryRouteAlias,
  getEffectCategoryRouteAliasParams,
} from "@server/next/publicRouteAliases";
import { getEffectCategoryRouteOutcome } from "@server/next/publicRouteOutcomes";
import { getStaticEffectCategoryParams } from "@server/next/staticParams";
import {
  generateTaxonomyMetadata,
  generateTaxonomyStaticParams,
  renderTaxonomyDetailPage,
  type TaxonomyDetailRouteDescriptor,
  type TaxonomyRoutePageProps,
} from "@server/next/taxonomyDetailRoute";
import { redirect } from "next/navigation";
import { EffectCategoryPage as EffectCategoryDetailPage } from "@/features/effects/pages/EffectCategoryPage";

export const revalidate = 3600;
export const dynamicParams = false;

export async function generateStaticParams() {
  return [
    ...(await generateTaxonomyStaticParams(effectCategoryRoute)),
    ...getEffectCategoryRouteAliasParams(),
  ];
}

type EffectCategoryParams = {
  categorySlug: string;
};

type EffectCategoryOutcome = Awaited<ReturnType<typeof getEffectCategoryRouteOutcome>>;

const effectCategoryRoute: TaxonomyDetailRouteDescriptor<EffectCategoryParams, EffectCategoryOutcome> = {
  getStaticParams: async () => (await getStaticEffectCategoryParams()) as EffectCategoryParams[],
  getDetail: ({ categorySlug }) => getEffectCategoryRouteOutcome(categorySlug),
  isMissing: (outcome) => outcome.state === "not-found",
  getMetadata: ({ params, detail: outcome }) => ({
    title: `Effect category · ${params.categorySlug}`,
    description: `Browse ${outcome.state === "found" ? outcome.effects.length : 0} effects in the ${params.categorySlug} category.`,
    route: { family: "effectCategory", params },
  }),
  render: ({ params, detail: outcome }) => {
    if (outcome.state === "not-found") {
      throw new Error("Effect category route reached render with a missing outcome.");
    }

    return (
      <EffectCategoryDetailPage
        categorySlug={params.categorySlug}
        effects={outcome.effects}
        effectHrefPrefix="/effects/"
        backHref="/effects"
      />
    );
  },
};

export async function generateMetadata(props: TaxonomyRoutePageProps<EffectCategoryParams>) {
  return generateTaxonomyMetadata(effectCategoryRoute, props);
}

export default async function EffectCategoryPage(props: TaxonomyRoutePageProps<EffectCategoryParams>) {
  const params = await props.params;
  const alias = getEffectCategoryRouteAlias(params.categorySlug);

  if (alias) {
    redirect(`/effects/category/${alias}`);
  }

  return renderTaxonomyDetailPage(effectCategoryRoute, props);
}
