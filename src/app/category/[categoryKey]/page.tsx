import { getPublicEffectArticles } from "@server/convex/publicData";
import {
  getCategoryRouteAlias,
  getCategoryRouteAliasParams,
} from "@server/next/publicRouteAliases";
import { getCategoryRouteOutcome } from "@server/next/publicRouteOutcomes";
import { getStaticCategoryParams } from "@server/next/staticParams";
import {
  generateTaxonomyMetadata,
  generateTaxonomyStaticParams,
  renderTaxonomyDetailPage,
  type TaxonomyDetailRouteDescriptor,
  type TaxonomyRoutePageProps,
} from "@server/next/taxonomyDetailRoute";
import { redirect } from "next/navigation";
import { CategoryPage as CategoryDetailPage } from "@/components/pages/CategoryPage";

export const revalidate = 3600;
export const dynamicParams = false;

export async function generateStaticParams() {
  return [
    ...(await generateTaxonomyStaticParams(categoryRoute)),
    ...getCategoryRouteAliasParams(),
  ];
}

type CategoryParams = {
  categoryKey: string;
};

type CategoryDetailOutcome = Awaited<ReturnType<typeof getCategoryRouteOutcome>>;

const categoryRoute: TaxonomyDetailRouteDescriptor<CategoryParams, CategoryDetailOutcome> = {
  getStaticParams: async () => (await getStaticCategoryParams()) as CategoryParams[],
  getDetail: ({ categoryKey }) => getCategoryRouteOutcome(categoryKey),
  isMissing: (outcome) => outcome.state === "not-found",
  getMetadata: ({ params, detail: outcome }) => ({
    title: outcome.state === "found" ? outcome.detail.definition.name : "Category",
    description: outcome.state === "found"
      ? `Browse ${outcome.detail.total} substances grouped under ${outcome.detail.definition.name}.`
      : "Browse substances by category.",
    route: { family: "category", params },
  }),
  render: async ({ detail: outcome }) => {
    if (outcome.state === "not-found") {
      throw new Error("Category route reached render with a missing outcome.");
    }

    const effects = await getPublicEffectArticles();

    return <CategoryDetailPage detail={outcome.detail} effects={effects} drugHrefPrefix="/" />;
  },
};

export async function generateMetadata(props: TaxonomyRoutePageProps<CategoryParams>) {
  return generateTaxonomyMetadata(categoryRoute, props);
}

export default async function CategoryPage(props: TaxonomyRoutePageProps<CategoryParams>) {
  const params = await props.params;
  const alias = getCategoryRouteAlias(params.categoryKey);

  if (alias) {
    redirect(`/category/${alias}`);
  }

  return renderTaxonomyDetailPage(categoryRoute, props);
}
