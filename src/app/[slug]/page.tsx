import { Suspense } from "react";
import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getPublicSubstanceBySlug } from "@server/convex/publicData";
import { getStaticSubstanceParams } from "@server/next/staticParams";
import { SubstanceTripReportsSection, SubstanceTripReportsSectionFallback } from "../_components/public-routes/SubstanceTripReportsSection";
import { SubstanceArticlePage } from "@/features/article/pages/SubstanceArticlePage";

export const revalidate = 3600;

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
  const substance = await getPublicSubstanceBySlug(slug);

  if (!substance) {
    notFound();
  }

  return buildPageMetadata({
    title: substance.title,
    description: substance.summary,
    pathname: `/${slug}`,
  });
}

export default async function SubstancePage({ params }: SubstancePageProps) {
  const { slug } = await params;
  const substance = await getPublicSubstanceBySlug(slug);

  if (!substance) {
    notFound();
  }

  const { slug: _resolvedSlug, ...article } = substance;

  return (
    <SubstanceArticlePage
      article={article}
      fromSubstanceSlug={slug}
      tripReportsSection={
        <Suspense fallback={<SubstanceTripReportsSectionFallback />}>
          <SubstanceTripReportsSection article={article} slug={slug} />
        </Suspense>
      }
    />
  );
}
