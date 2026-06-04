import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getSubstanceRouteOutcome } from "@server/next/publicRouteOutcomes";
import { getStaticSubstanceParams } from "@server/next/staticParams";
import { SubstanceArticlePage } from "@/features/article/pages/SubstanceArticlePage";

export const revalidate = 3600;
export const dynamicParams = false;

export async function generateStaticParams() {
  return await getStaticSubstanceParams();
}

type SubstancePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: SubstancePageProps) {
  const { slug } = await params;
  const outcome = await getSubstanceRouteOutcome(slug);

  if (outcome.state === "not-found") {
    notFound();
  }

  return buildPublicPageMetadata({
    title: outcome.viewModel.metadata.title,
    description: outcome.viewModel.metadata.description,
    route: { family: "substance", params: { slug } },
  });
}

export default async function SubstancePage({ params }: SubstancePageProps) {
  const { slug } = await params;
  const outcome = await getSubstanceRouteOutcome(slug);

  if (outcome.state === "not-found") {
    notFound();
  }

  return <SubstanceArticlePage {...outcome.viewModel.pageProps} />;
}
