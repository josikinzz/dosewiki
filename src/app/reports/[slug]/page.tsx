import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadReportRoute, REPORT_FALLBACK_METADATA } from "@server/next/routeLoaders.reports";
import { getStaticReportParams } from "@server/next/staticParams";
import { TripReportDetailPage } from "@/features/reports/pages/TripReportDetailPage";
import type { TripReportSubstance } from "@/types/tripReport";
import { publicHref } from "@/utils/publicHref";
import { slugify } from "@/utils/slug";
import { entitySocialCardImage } from "@/data/mappings/entitySocialCardUrl";

/**
 * Resolve report substance names to public article hrefs using the substance
 * lookup already loaded for the back-target. Only substances whose slug matches
 * a known article are linked, so the chip never becomes a 404 false-affordance.
 */
function buildSubstanceLinks(
  substances: TripReportSubstance[],
  substanceBySlug: Record<string, { name: string }>,
): Record<string, string> {
  const links: Record<string, string> = {};
  for (const substance of substances) {
    const slug = slugify(substance.name);
    if (slug && substanceBySlug[slug]) {
      links[substance.name] = publicHref.substance(slug);
    }
  }
  return links;
}

export const revalidate = 3600;

export async function generateStaticParams() {
  return await getStaticReportParams();
}

type ReportPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: ReportPageProps) {
  const { slug } = await params;
  const result = await loadReportRoute(slug);

  if (result.kind === "not-found") {
    return buildPublicPageMetadata({
      ...REPORT_FALLBACK_METADATA,
      route: { family: "report", params: { slug } },
    });
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
    socialImage: entitySocialCardImage(
      "reports",
      result.pageProps.report.slug,
      `${result.pageProps.report.title} experience report card`,
    ),
  });
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { slug } = await params;
  const result = await loadReportRoute(slug);

  if (result.kind === "not-found") {
    notFound();
  }

  const substanceLinks = buildSubstanceLinks(
    result.pageProps.report.substances,
    result.substanceBySlug,
  );

  // `?from=` (the substance page the reader arrived from) is deliberately not
  // read here: it only retargets the back link, and awaiting `searchParams`
  // would force this whole prerendered article to render per request. The
  // client-side ReportBackLink inside TripReportDetailPage resolves it against
  // `substanceBySlug` instead.
  return (
    <TripReportDetailPage
      {...result.pageProps}
      substanceBySlug={result.substanceBySlug}
      substanceLinks={substanceLinks}
    />
  );
}
