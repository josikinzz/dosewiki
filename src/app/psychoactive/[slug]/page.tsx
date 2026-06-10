import { notFound, redirect } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import {
  loadPsychoactiveClassRoute,
  loadTaxonomyStaticParams,
  psychoactiveClassRouteDescriptor,
} from "@server/next/routeLoaders";
import { ClassificationDetailPage } from "@/components/pages/ClassificationDetailPage";

export const revalidate = 3600;

export async function generateStaticParams() {
  return loadTaxonomyStaticParams(psychoactiveClassRouteDescriptor);
}

type PsychoactiveClassPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: PsychoactiveClassPageProps) {
  const { slug } = await params;
  const result = await loadPsychoactiveClassRoute(slug);

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function PsychoactiveClassificationPage({ params }: PsychoactiveClassPageProps) {
  const { slug } = await params;
  const result = await loadPsychoactiveClassRoute(slug);

  if (result.kind === "redirect") {
    redirect(result.target);
  }

  if (result.kind !== "ok") {
    notFound();
  }

  return <ClassificationDetailPage detail={result.detail} drugHrefPrefix="/" />;
}
