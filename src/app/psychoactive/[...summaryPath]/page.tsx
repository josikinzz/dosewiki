import { notFound } from "next/navigation";

import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadPsychoactiveSummaryRoute } from "@server/next/routeLoaders";
import { getStaticPsychoactiveSummaryParams } from "@server/next/staticParams";
import { PsychoactiveSummaryPage } from "@/features/psychoactive-summaries/PsychoactiveSummaryPage";

export const revalidate = 3600;
export const dynamicParams = false;

export async function generateStaticParams() {
  return await getStaticPsychoactiveSummaryParams();
}

type PsychoactiveSummaryRoutePageProps = {
  params: Promise<{
    summaryPath: string[];
  }>;
};

export async function generateMetadata({
  params,
}: PsychoactiveSummaryRoutePageProps) {
  const { summaryPath } = await params;
  const result = await loadPsychoactiveSummaryRoute(summaryPath);

  if (result.kind === "not-found") {
    notFound();
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function PsychoactiveSummaryRoutePage({
  params,
}: PsychoactiveSummaryRoutePageProps) {
  const { summaryPath } = await params;
  const result = await loadPsychoactiveSummaryRoute(summaryPath);

  if (result.kind === "not-found") {
    notFound();
  }

  return <PsychoactiveSummaryPage {...result.pageProps} />;
}
